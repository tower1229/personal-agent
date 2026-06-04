import {
  builtInToolNames,
  type BuiltInToolName,
  controlledToolNames,
  type ControlledToolName,
  type PlannerRouteDecision,
  type ToolRiskLevel,
  type PersonalModelLayer,
  type PersonalModelConfidence
} from "@personal-agent/shared";
import { type SearchClient, type UrlFetcher } from "./externalTools.js";
import {
  type LlmClient,
  type LlmMessage,
  type LlmToolCall,
  type LlmToolDefinition
} from "./llm.js";
import { type AgentRepositories } from "./repositories.js";
import { type WorkerEnv } from "./types.js";
import { assemblePersonalModelContext } from "./personalModelContext.js";
import { type PersonalModelScenario, type PersonalModelSourceType } from "@personal-agent/shared";
import {
  normalizeSourceContent,
  chunkSourceContent,
  tokenCountForChunk
} from "./personalModelSources.js";
import { reflectAndProposeClaims } from "./personalModelReflection.js";

const UNTRUSTED_INSTRUCTION_WARNING = "网页内容包含疑似指令注入，已忽略其指令性内容。";

export interface AgentRuntime {
  repositories: AgentRepositories;
  llmClient?: LlmClient;
  searchClient?: SearchClient;
  urlFetcher?: UrlFetcher;
  now: () => number;
  generateId: () => string;
  generateApprovalCode: () => string;
  env?: WorkerEnv;
}

export interface AgentToolResult {
  responseText: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
  input: unknown;
  output: unknown;
  contextTraceJson?: string;
}

export interface LlmAgentInput {
  runId: string;
  sessionId: string;
  ownerTgUserId: number;
  inputText: string;
  runtime: AgentRuntime;
  allowedTools?: Set<string>;
  systemInstructions?: string;
  plannerRouteDecision?: PlannerRouteDecision;
  maxToolRounds: number;
  thinkingTier?: "none" | "high" | "max";
  onThinking?: (state: { type: "thinking" | "tool"; toolName?: string }) => Promise<void>;
}

export class AgentExecutionError extends Error {
  constructor(message: string, readonly contextTraceJson: string) {
    super(message);
    this.name = "AgentExecutionError";
  }
}

function normalizeMemoryContent(content: string): string {
  return content.trim().toLocaleLowerCase();
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  return typeof value === "string" ? value.trim() : "";
}

function numberArg(args: Record<string, unknown>, name: string): number | null {
  const value = args[name];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function isAllowed(input: {
  allowedTools?: Set<string>;
  toolName: string;
}): boolean {
  return !input.allowedTools || input.allowedTools.has(input.toolName);
}

async function recordToolCall(input: {
  runtime: AgentRuntime;
  runId: string;
  ownerTgUserId: number;
  result: AgentToolResult;
  status: "succeeded" | "failed";
  error?: string | null;
}) {
  await input.runtime.repositories.recordToolCall({
    id: input.runtime.generateId(),
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    toolName: input.result.toolName,
    riskLevel: input.result.riskLevel,
    status: input.status,
    inputJson: JSON.stringify(input.result.input),
    outputJson:
      input.status === "succeeded" ? JSON.stringify(input.result.output) : null,
    error: input.error ?? null,
    createdAt: input.runtime.now()
  });
}

async function createDeleteMemoryApproval(input: {
  runtime: AgentRuntime;
  ownerTgUserId: number;
  memoryId: number;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await input.runtime.repositories.createApproval({
        id: input.runtime.generateId(),
        ownerTgUserId: input.ownerTgUserId,
        action: "delete_memory",
        payloadJson: JSON.stringify({ memoryId: input.memoryId }),
        status: "pending",
        code: input.runtime.generateApprovalCode(),
        createdAt: input.runtime.now(),
        decidedAt: null
      });
    } catch (error) {
      if (attempt === 2) {
        return null;
      }
    }
  }

  return null;
}

export async function executeAgentTool(input: {
  runId: string;
  ownerTgUserId: number;
  toolName: string;
  args: Record<string, unknown>;
  runtime: AgentRuntime;
  allowedTools?: Set<string>;
  record?: boolean;
}): Promise<AgentToolResult> {
  const record = input.record ?? true;
  let result: AgentToolResult;

  try {
    if (!isAllowed({ allowedTools: input.allowedTools, toolName: input.toolName })) {
      result = {
        responseText: `这个 skill 不允许使用工具 ${input.toolName}。`,
        toolName: "skill_tool_blocked",
        riskLevel: "read",
        input: { requestedTool: input.toolName },
        output: { blocked: true }
      };
    } else if (input.toolName === "create_todo") {
      const title = stringArg(input.args, "title");
      const dueTimeIso = stringArg(input.args, "dueTimeIso");
      
      let dueAt: number | undefined;
      if (dueTimeIso) {
        const parsed = Date.parse(dueTimeIso);
        if (Number.isFinite(parsed)) {
          dueAt = parsed;
        } else {
          throw new Error("Invalid dueTimeIso format. Please use ISO 8601 string.");
        }
      }

      const todo = title
        ? await input.runtime.repositories.createTodo({
            ownerTgUserId: input.ownerTgUserId,
            title,
            createdAt: input.runtime.now(),
            dueAt
          })
        : null;

      let responseText = todo ? `已创建待办 #${todo.id}：${todo.title}` : "待办内容不能为空。";
      if (todo && dueAt) {
        responseText += ` (到期时间: ${new Date(dueAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })})`;
      }

      result = {
        responseText,
        toolName: "create_todo",
        riskLevel: "write_low",
        input: { title, dueTimeIso },
        output: todo ? { id: todo.id, title: todo.title, dueAt: todo.dueAt } : { created: false }
      };
    } else if (input.toolName === "list_todos") {
      const todos = await input.runtime.repositories.listOpenTodos(
        input.ownerTgUserId,
        20
      );
      result = {
        responseText:
          todos.length === 0
            ? "当前没有未完成待办。"
            : ["未完成待办：", ...todos.map((todo) => `#${todo.id} ${todo.title}${todo.dueAt ? ` (到期时间: ${new Date(todo.dueAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })})` : ""}`)].join("\n"),
        toolName: "list_todos",
        riskLevel: "read",
        input: { status: "open" },
        output: { todos }
      };
    } else if (input.toolName === "complete_todo") {
      const id = numberArg(input.args, "id");
      const todo =
        id === null
          ? null
          : await input.runtime.repositories.completeTodo({
              ownerTgUserId: input.ownerTgUserId,
              id,
              completedAt: input.runtime.now()
            });
      result = {
        responseText: todo
          ? `已完成待办 #${todo.id}：${todo.title}`
          : `没有找到未完成待办 #${id ?? ""}。`,
        toolName: "complete_todo",
        riskLevel: "write_low",
        input: { id },
        output: { completed: Boolean(todo) }
      };
    } else if (input.toolName === "save_memory") {
      const content = stringArg(input.args, "content");
      const memory = content
        ? await input.runtime.repositories.createMemory({
            ownerTgUserId: input.ownerTgUserId,
            content,
            normalizedContent: normalizeMemoryContent(content),
            createdAt: input.runtime.now()
          })
        : null;
      if (memory) {
        await input.runtime.repositories.recordMemoryEvent({
          memoryId: memory.id,
          ownerTgUserId: input.ownerTgUserId,
          eventType: "created",
          payload: { source: "llm_agent" },
          createdAt: input.runtime.now()
        });
      }
      result = {
        responseText: memory ? `已保存记忆 #${memory.id}。` : "记忆内容不能为空。",
        toolName: "save_memory",
        riskLevel: "write_low",
        input: { content },
        output: memory ? { id: memory.id } : { saved: false }
      };
    } else if (input.toolName === "update_core_memory") {
      const content = stringArg(input.args, "content") ?? "";
      let userProfile = await input.runtime.repositories.getUserProfile(input.ownerTgUserId.toString());
      if (!userProfile) {
        userProfile = {
          id: input.ownerTgUserId.toString(),
          name: "Owner",
          birthdayTimestamp: null,
          gender: null,
          interpretationFramework: null,
          preferences: null,
          coreMemory: null,
          createdAt: input.runtime.now(),
          updatedAt: input.runtime.now()
        };
      }
      userProfile.coreMemory = content;
      userProfile.updatedAt = input.runtime.now();
      await input.runtime.repositories.upsertUserProfile(userProfile);
      
      result = {
        responseText: `已更新核心记忆。`,
        toolName: "update_core_memory",
        riskLevel: "write_low",
        input: { content },
        output: { updated: true }
      };
    } else if (input.toolName === "search_memory") {
      const keyword = stringArg(input.args, "keyword");
      const memories = await input.runtime.repositories.searchMemories({
        ownerTgUserId: input.ownerTgUserId,
        keyword: normalizeMemoryContent(keyword),
        limit: 5
      });
      result = {
        responseText:
          memories.length === 0
            ? "没有找到相关记忆。"
            : ["找到这些记忆：", ...memories.map((memory) => `#${memory.id} ${memory.content}`)].join("\n"),
        toolName: "search_memory",
        riskLevel: "read",
        input: { keyword },
        output: { memories }
      };
    } else if (input.toolName === "delete_memory_request") {
      const id = numberArg(input.args, "id");
      const memory =
        id === null
          ? null
          : await input.runtime.repositories.getActiveMemory({
              ownerTgUserId: input.ownerTgUserId,
              id
            });
      const approval = memory
        ? await createDeleteMemoryApproval({
            runtime: input.runtime,
            ownerTgUserId: input.ownerTgUserId,
            memoryId: memory.id
          })
        : null;
      result = {
        responseText: approval
          ? `删除记忆 #${memory?.id} 需要确认。发送：确认 ${approval.code}`
          : `没有找到可删除的记忆 #${id ?? ""}。`,
        toolName: "delete_memory_request",
        riskLevel: "destructive",
        input: { id },
        output: approval
          ? { approvalId: approval.id, code: approval.code }
          : { approvalCreated: false }
      };
    } else if (input.toolName === "web_search") {
      if (!input.runtime.searchClient) {
        throw new Error("Brave search is not configured");
      }
      const query = stringArg(input.args, "query");
      const results = await input.runtime.searchClient.search({ query, count: 5 });
      result = {
        responseText:
          results.length === 0
            ? "没有搜索到结果。"
            : results
                .map((item) => `${item.rank}. ${item.title}\n${item.url}\n${item.description}`)
                .join("\n\n"),
        toolName: "web_search",
        riskLevel: "external_send",
        input: { query },
        output: { results }
      };
    } else if (input.toolName === "fetch_url") {
      if (!input.runtime.urlFetcher) {
        throw new Error("fetch_url is not configured");
      }
      const url = stringArg(input.args, "url");
      const fetched = await input.runtime.urlFetcher.fetchUrl({ url });
      
      let responseText = fetched.text;
      const MAX_TEXT_LENGTH = 15000;
      
      if (responseText.length > MAX_TEXT_LENGTH) {
        if (input.runtime.llmClient) {
          try {
            const summaryResponse = await input.runtime.llmClient.createChatCompletion({
              messages: [
                {
                  role: "system",
                  content: "You are a helpful assistant. Please summarize the following long web page content. You must retain the core information, main arguments, and specific facts so they can be cited later. If the content seems to be truncated halfway, summarize what is available."
                },
                { role: "user", content: responseText.slice(0, 30000) }
              ],
              thinkingTier: "max"
            });
            responseText = summaryResponse.content + "\n\n[System Note: The original page was too long and has been summarized by the system. Some details might be omitted.]";
          } catch (e) {
            responseText = responseText.slice(0, MAX_TEXT_LENGTH) + "\n\n[System Note: The web page content exceeded the maximum context limit. The text has been truncated.]";
          }
        } else {
          responseText = responseText.slice(0, MAX_TEXT_LENGTH) + "\n\n[System Note: The web page content exceeded the maximum context limit. The text has been truncated.]";
        }
      } else if (fetched.isTruncated) {
        responseText = responseText + "\n\n[System Note: The web page content was too large to fully download. The text has been truncated.]";
      }

      result = {
        responseText,
        toolName: "fetch_url",
        riskLevel: "external_send",
        input: { url },
        output: { ...fetched, text: responseText }
      };
    } else if (input.toolName === "record_understanding_gap") {
      const scenario = stringArg(input.args, "scenario") as PersonalModelScenario | "" || "global";
      const gapDescription = stringArg(input.args, "gapDescription") || "";
      if (gapDescription) {
        await input.runtime.repositories.createPersonalModelUnderstandingGap({
          id: input.runtime.generateId(),
          ownerTgUserId: input.ownerTgUserId,
          scenario,
          gapDescription,
          status: "open",
          createdAt: input.runtime.now(),
          updatedAt: input.runtime.now()
        });
      }
      result = {
        responseText: gapDescription ? "已记录认知缺口。" : "缺少描述。",
        toolName: "record_understanding_gap",
        riskLevel: "write_low",
        input: { scenario, gapDescription },
        output: gapDescription ? { recorded: true } : { recorded: false }
      };
    } else if (input.toolName === "record_metacognition_log") {
      const content = stringArg(input.args, "content") || "";
      if (content) {
        await input.runtime.repositories.createPersonalModelMetacognitionLog({
          id: input.runtime.generateId(),
          ownerTgUserId: input.ownerTgUserId,
          reflectionType: "correction",
          content,
          relatedClaimId: null,
          relatedGapId: null,
          createdAt: input.runtime.now()
        });
      }
      result = {
        responseText: content ? "已记录修正理解（元认知）。" : "缺少内容。",
        toolName: "record_metacognition_log",
        riskLevel: "write_low",
        input: { content },
        output: content ? { recorded: true } : { recorded: false }
      };
    } else if (input.toolName === "save_interview_source") {
      const sourceType = stringArg(input.args, "sourceType");
      const title = stringArg(input.args, "title");
      const content = stringArg(input.args, "content");
      const metadata = (input.args.metadata as Record<string, unknown> | undefined) || {};
      const resolveGapId = input.args.resolveGapId ? String(input.args.resolveGapId) : null;
      const claims = (input.args.claims as Array<{ claim: string, layer: string, scenario: string, confidence: string }> | undefined) || [];

      const allowedAgentTypes = ["personality_framework", "health_log", "relationship_note"];
      if (sourceType && !allowedAgentTypes.includes(sourceType)) {
        throw new Error(`Agent is only allowed to save source types: ${allowedAgentTypes.join(", ")}`);
      }

      let source = null;
      let chunksCount = 0;
      if (sourceType && title && content) {
        const now = input.runtime.now();
        const generateId = () => input.runtime.generateId();
        
        // 1. Create source document
        source = await input.runtime.repositories.createPersonalModelSourceDocument({
          id: generateId(),
          ownerTgUserId: input.ownerTgUserId,
          sourceType: sourceType as PersonalModelSourceType,
          title,
          uri: null,
          content,
          normalizedContent: normalizeSourceContent(content),
          status: "active",
          usagePolicy: "default_available",
          sensitivity: "medium",
          sourceCreatedAt: null,
          sourceUpdatedAt: null,
          ingestedAt: now,
          metadataJson: JSON.stringify(metadata)
        });

        // 2. Generate and save chunks
        const chunkDrafts = chunkSourceContent({ content, sourceType });
        chunksCount = chunkDrafts.length;
        for (const [index, chunk] of chunkDrafts.entries()) {
          await input.runtime.repositories.createPersonalModelSourceChunk({
            id: generateId(),
            documentId: source.id,
            ownerTgUserId: input.ownerTgUserId,
            chunkIndex: index,
            content: chunk.content,
            normalizedContent: normalizeSourceContent(chunk.content),
            tokenCount: tokenCountForChunk(chunk.content),
            metadataJson: JSON.stringify(chunk.metadata),
            createdAt: now,
            vectorId: null,
            indexedAt: null,
            indexStatus: "pending"
          });
        }

        // 3. Automatically resolve Gap if resolveGapId is provided
        if (resolveGapId) {
          await input.runtime.repositories.updatePersonalModelUnderstandingGapStatus({
            ownerTgUserId: input.ownerTgUserId,
            gapId: resolveGapId,
            status: "resolved",
            updatedAt: now
          });
        }

        // 4. Save high-confidence claims
        for (const c of claims) {
          await input.runtime.repositories.createPersonalModelClaim({
            id: generateId(),
            ownerTgUserId: input.ownerTgUserId,
            claim: c.claim,
            layer: c.layer as PersonalModelLayer,
            scenario: c.scenario as PersonalModelScenario,
            confidence: c.confidence as PersonalModelConfidence,
            status: "active",
            usagePolicy: "default_available",
            sensitivity: "medium",
            validFrom: null,
            validUntil: null,
            lastConfirmedAt: null,
            metadataJson: "{}",
            createdAt: now,
            updatedAt: now
          });
        }
      }

      result = {
        responseText: source
          ? `已成功将采访成果保存为资料，生成 ${chunksCount} 个分块${resolveGapId ? "，且已关闭对应认知缺口" : ""}${claims.length > 0 ? `，并成功录入 ${claims.length} 条高置信度结论` : ""}。`
          : "保存资料失败，缺少必要参数。",
        toolName: "save_interview_source",
        riskLevel: "write_low",
        input: { sourceType, title, content, metadata, resolveGapId, claims },
        output: source
          ? { saved: true, sourceId: source.id, chunkCount: chunksCount, resolveGapId, claimsWritten: claims.length }
          : { saved: false }
      };
    } else {
      throw new Error(`Unknown tool: ${input.toolName}`);
    }

    if (record) {
      await recordToolCall({
        runtime: input.runtime,
        runId: input.runId,
        ownerTgUserId: input.ownerTgUserId,
        result,
        status: "succeeded"
      });
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool failed";
    const failed: AgentToolResult = {
      responseText: message,
      toolName: input.toolName,
      riskLevel:
        input.toolName === "web_search" || input.toolName === "fetch_url"
          ? "external_send"
          : "read",
      input: input.args,
      output: null
    };
    if (record) {
      await recordToolCall({
        runtime: input.runtime,
        runId: input.runId,
        ownerTgUserId: input.ownerTgUserId,
        result: failed,
        status: "failed",
        error: message
      });
    }
    throw error;
  }
}

const toolDefinitions: Record<BuiltInToolName, LlmToolDefinition> = {
  create_todo: {
    type: "function",
    function: {
      name: "create_todo",
      description: "Create a todo item.",
      parameters: {
        type: "object",
        properties: { 
          title: { type: "string" },
          dueTimeIso: { type: "string", description: "ISO 8601 format string representing the due time (e.g. 2026-06-03T15:00:00+08:00). Must include timezone offset. Can be omitted if no due time is specified." }
        },
        required: ["title"]
      }
    }
  },
  list_todos: {
    type: "function",
    function: {
      name: "list_todos",
      description: "List open todo items.",
      parameters: { type: "object", properties: {} }
    }
  },
  complete_todo: {
    type: "function",
    function: {
      name: "complete_todo",
      description: "Complete an open todo by numeric id.",
      parameters: {
        type: "object",
        properties: { id: { type: "number" } },
        required: ["id"]
      }
    }
  },
  save_memory: {
    type: "function",
    function: {
      name: "save_memory",
      description: "Save a log memory or an event for the owner.",
      parameters: {
        type: "object",
        properties: { content: { type: "string" } },
        required: ["content"]
      }
    }
  },
  update_core_memory: {
    type: "function",
    function: {
      name: "update_core_memory",
      description: "Update the core memory markdown document of the user. Overwrites the existing core memory.",
      parameters: {
        type: "object",
        properties: { content: { type: "string", description: "The full markdown content for the core memory." } },
        required: ["content"]
      }
    }
  },
  search_memory: {
    type: "function",
    function: {
      name: "search_memory",
      description: "Search saved memories.",
      parameters: {
        type: "object",
        properties: { keyword: { type: "string" } },
        required: ["keyword"]
      }
    }
  },
  delete_memory_request: {
    type: "function",
    function: {
      name: "delete_memory_request",
      description: "Request approval before deleting a memory by id.",
      parameters: {
        type: "object",
        properties: { id: { type: "number" } },
        required: ["id"]
      }
    }
  },
  web_search: {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the public web. Cite result URLs in the final answer.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }
  },
  fetch_url: {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch text from an http or https URL. Cite the URL if used.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"]
      }
    }
  },
  record_understanding_gap: {
    type: "function",
    function: {
      name: "record_understanding_gap",
      description: "Record a gap in your understanding about the user when you realize you need more information to assist them properly.",
      parameters: {
        type: "object",
        properties: {
          scenario: { type: "string", description: "The scenario, e.g. global, writing, relationship, etc." },
          gapDescription: { type: "string", description: "What you don't know and need to find out." }
        },
        required: ["scenario", "gapDescription"]
      }
    }
  },
  record_metacognition_log: {
    type: "function",
    function: {
      name: "record_metacognition_log",
      description: "Record a reflection or correction when the user points out a misunderstanding or corrects your previous assumptions.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Detailed description of what you misunderstood and what the correct understanding is." }
        },
        required: ["content"]
      }
    }
  },
  save_interview_source: {
    type: "function",
    function: {
      name: "save_interview_source",
      description: "Save structured interview results or dynamic conversation findings as a source document and automatically resolve the corresponding gap.",
      parameters: {
        type: "object",
        properties: {
          sourceType: {
            type: "string",
            enum: ["personality_framework", "health_log", "relationship_note"],
            description: "The category of the source to save."
          },
          title: {
            type: "string",
            description: "A short descriptive title for this record, e.g., 'Personality Framework MBTI Interview'."
          },
          content: {
            type: "string",
            description: "The structured content or summarized text to save. Use markdown headers or sections for clarity."
          },
          metadata: {
            type: "object",
            description: "Optional metadata matching the sourceType schema (e.g. frameworkType/agreementLevel for personality_framework)."
          },
          resolveGapId: {
            type: "string",
            description: "Optional Gap ID to automatically resolve once this source is successfully saved."
          },
          claims: {
            type: "array",
            items: {
              type: "object",
              properties: {
                claim: { type: "string", description: "The high-confidence conclusion or fact." },
                layer: { type: "string", enum: ["core", "preference", "behavior", "context"], description: "The layer of the claim." },
                scenario: { type: "string", description: "The applicable scenario (e.g., global, health, relationship)." },
                confidence: { type: "string", enum: ["low", "medium", "high"], description: "Confidence score (low, medium, or high). For confirmed facts, use high." }
              },
              required: ["claim", "layer", "scenario", "confidence"]
            },
            description: "Optional list of high-confidence claims to directly inject into the personal model alongside the raw source document."
          }
        },
        required: ["sourceType", "title", "content"]
      }
    }
  },
  submit_answer: {
    type: "function",
    function: {
      name: "submit_answer",
      description: "Submit the final answer. You MUST use this tool to provide the final answer if you have used web_search or fetch_url. You MUST provide citations for the facts included in your answer.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "The final answer text in Markdown format." },
          citations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string", description: "The URL of the cited source." },
                title: { type: "string", description: "The title of the cited source." },
                snippet_used: { type: "string", description: "The exact snippet or specific fact used from the source." }
              },
              required: ["url", "title", "snippet_used"]
            },
            description: "List of citations used to support the facts in the answer."
          }
        },
        required: ["text", "citations"]
      }
    }
  }
};

function availableToolDefinitions(allowedTools?: Set<string>): LlmToolDefinition[] {
  return builtInToolNames
    .filter((name) => !allowedTools || allowedTools.has(name))
    .map((name) => toolDefinitions[name]);
}

type ExecutionPlanStatus = "not_requested" | "generated" | "invalid";

interface AgentExecutionPlanStep {
  step: number;
  action: "tool" | "answer" | "ask_user";
  tool?: string;
  reason: string;
}

interface AgentExecutionPlan {
  status: ExecutionPlanStatus;
  steps: AgentExecutionPlanStep[];
  error?: string;
}

function shouldRequestExecutionPlan(input: {
  inputText: string;
  allowedToolNames: string[];
}): boolean {
  if (input.allowedToolNames.length === 0) {
    return false;
  }

  const text = input.inputText.toLowerCase();
  const toolHints: Array<[string, RegExp]> = [
    ["create_todo", /新增待办|添加待办|创建待办|记个待办|todo/u],
    ["list_todos", /列出待办|查看待办|待办列表|未完成待办/u],
    ["complete_todo", /完成待办|划掉待办/u],
    ["save_memory", /记住|保存日志|记作事件/u],
    ["update_core_memory", /更新核心记忆|修改核心记忆/u],
    ["search_memory", /搜索记忆|查询记忆|回忆/u],
    ["delete_memory_request", /删除记忆/u],
    ["web_search", /搜索网页|联网|查一下|查找|搜索/u],
    ["fetch_url", /读取网页|抓取网页|https?:\/\//u],
    ["record_understanding_gap", /不了解|不知道|需要.*了解/u],
    ["record_metacognition_log", /纠正|修正理解|反思/u],
    ["save_interview_source", /采访|访谈|保存.*资料/u]
  ];

  return toolHints.some(
    ([toolName, pattern]) => input.allowedToolNames.includes(toolName) && pattern.test(text)
  );
}

function isControlledToolName(toolName: string): toolName is ControlledToolName {
  return controlledToolNames.includes(toolName as ControlledToolName);
}

function toolDefinitionsByNames(
  tools: LlmToolDefinition[],
  names: Set<string>
): LlmToolDefinition[] {
  return tools.filter((tool) => names.has(tool.function.name));
}

function normalizeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0"
  ) {
    return true;
  }

  const parts = host.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  return host === "::1" || host.startsWith("fc") || host.startsWith("fd");
}

function normalizeExecutionPlan(
  raw: unknown,
  allowedToolNames: Set<string>
): AgentExecutionPlanStep[] {
  if (!Array.isArray(raw)) {
    throw new Error("Planner returned non-array JSON");
  }

  return raw.reduce<AgentExecutionPlanStep[]>((items, item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return items;
    }
    const record = item as Record<string, unknown>;
    const tool = typeof record.tool === "string" ? record.tool : undefined;
    const action =
      record.action === "answer" || record.action === "ask_user" || record.action === "tool"
        ? record.action
        : tool
          ? "tool"
          : "answer";

    if (action === "tool" && (!tool || !allowedToolNames.has(tool))) {
      return items;
    }

    const step =
      typeof record.step === "number" && Number.isFinite(record.step)
        ? Math.max(1, Math.trunc(record.step))
        : index + 1;
    items.push({
      step,
      action,
      ...(tool ? { tool } : {}),
      reason:
        typeof record.reason === "string" && record.reason.trim()
          ? record.reason.trim()
          : "planned execution"
    });
    return items;
  }, []);
}



async function recordLlmCall(input: {
  runtime: AgentRuntime;
  runId: string;
  ownerTgUserId: number;
  messages: LlmMessage[];
  output: { content: string; toolCalls: LlmToolCall[] };
}) {
  await input.runtime.repositories.recordToolCall({
    id: input.runtime.generateId(),
    runId: input.runId,
    ownerTgUserId: input.ownerTgUserId,
    toolName: "llm_chat_completion",
    riskLevel: "external_send",
    status: "succeeded",
    inputJson: JSON.stringify({
      messageCount: input.messages.length
    }),
    outputJson: JSON.stringify({
      content: input.output.content,
      toolCalls: input.output.toolCalls.map((call) => call.function.name)
    }),
    error: null,
    createdAt: input.runtime.now()
  });
}

async function generateAgentExecutionPlan(input: {
  llmClient: LlmClient;
  inputText: string;
  allowedTools: string[];
  hasInitialGaps: boolean;
}): Promise<AgentExecutionPlan> {
  const gapRule = input.hasInitialGaps
    ? "\n【强主动拦截规则】当前用户存在核心模型初始化Gap。除非用户明确要求执行工具任务，否则你的计划必须是发起访谈(action: ask_user)，强引导用户回答以填补这些未知的性格或偏好Gap。"
    : "";

  const completion = await input.llmClient.createChatCompletion({
    messages: [
      {
        role: "system",
        content: `你是智能助手的执行规划者(Planner)。请根据用户的请求，在实际执行工具前制定一个单层的轻量化执行计划。
可用工具：${input.allowedTools.join(", ")}
要求返回严格的 JSON 数组，格式为 [{"step": 1, "action": "tool|answer|ask_user", "tool": "toolName", "reason": "why"}...]
只有 action 为 tool 时才填写 tool，且 tool 必须来自可用工具。
如果你规划了 web_search 或 fetch_url，后续必须紧跟一个 submit_answer 工具调用来提交最终回答。
如果没有需要调用的工具，可以直接返回空数组。不要包含任何 markdown 标记或其他文本。${gapRule}`
      },
      {
        role: "user",
        content: input.inputText
      }
    ],
    thinkingTier: "high"
  });

  try {
    const text = /\[[\s\S]*\]/u.exec(completion.content)?.[0];
    if (!text) {
      throw new Error("Planner returned no JSON array");
    }
    const parsed = JSON.parse(text);
    return {
      status: "generated",
      steps: normalizeExecutionPlan(parsed, new Set(input.allowedTools))
    };
  } catch (error) {
    return {
      status: "invalid",
      steps: [],
      error: error instanceof Error ? error.message : "Planner returned invalid JSON"
    };
  }
}

export async function executeLlmAgent(
  input: LlmAgentInput
): Promise<AgentToolResult> {
  if (!input.runtime.llmClient) {
    throw new Error("LLM is not configured");
  }

  const contextAssembly = await assemblePersonalModelContext({
    repositories: input.runtime.repositories,
    ownerTgUserId: input.ownerTgUserId,
    inputText: input.inputText,
    now: input.runtime.now(),
    env: input.runtime.env
  });

  for (const claimId of contextAssembly.trace.selectedClaimIds) {
    await input.runtime.repositories.createPersonalModelEvent({
      id: crypto.randomUUID(),
      claimId,
      ownerTgUserId: input.ownerTgUserId,
      eventType: "used_in_response",
      payloadJson: JSON.stringify({ runId: input.runId, scenario: contextAssembly.trace.scenario }),
      createdAt: input.runtime.now()
    });
  }

  for (const claimId of contextAssembly.trace.excludedClaimIds) {
    await input.runtime.repositories.createPersonalModelEvent({
      id: crypto.randomUUID(),
      claimId,
      ownerTgUserId: input.ownerTgUserId,
      eventType: "excluded_by_policy",
      payloadJson: JSON.stringify({ runId: input.runId, reason: "scenario_mismatch" }),
      createdAt: input.runtime.now()
    });
  }

  const profile = await input.runtime.repositories.getUserProfile(input.ownerTgUserId.toString());
  let profileContext = "";
  if (profile) {
    const parts = [];
    if (profile.name) parts.push(`称呼: ${profile.name}`);
    if (profile.gender) parts.push(`性别: ${profile.gender}`);
    if (profile.birthdayTimestamp) {
      const age = new Date(input.runtime.now() - profile.birthdayTimestamp).getUTCFullYear() - 1970;
      parts.push(`真实年龄: ${age}岁`);
    }
    let basicProfile = "";
    if (parts.length > 0) {
      basicProfile = `[用户档案: ${parts.join(", ")}]\n`;
    }
    
    let soulContext = "";
    if (profile.preferences) {
      try {
        const pref = JSON.parse(profile.preferences);
        if (pref.soul) {
          soulContext = `[Agent SOUL (核心性格与原则)]\n${pref.soul}\n`;
        }
      } catch (e) {
        // ignore
      }
    }
    
    let coreMem = "";
    if (profile.coreMemory) {
      coreMem = `[核心记忆/Core Memory (最高优先级)]\n${profile.coreMemory}\n`;
    }
    
    profileContext = basicProfile + soulContext + coreMem;
  }

  const tools = availableToolDefinitions(input.allowedTools);
  const allowedToolNames = tools.map((tool) => tool.function.name);
  const nonControlledToolNames = allowedToolNames.filter(
    (toolName) => !isControlledToolName(toolName)
  );
  const routeDecision = input.plannerRouteDecision;
  const candidateControlledToolNames = routeDecision?.mode === "plan_guided"
    ? [...routeDecision.candidateTools, "submit_answer"].filter((toolName) =>
        allowedToolNames.includes(toolName)
      )
    : [];
  const hasInitialGaps = contextAssembly.trace.selectedGapIds.length > 0;
  let plan: AgentExecutionPlan = { status: "not_requested", steps: [] };
  const shouldPlan = routeDecision
    ? routeDecision.mode === "plan_guided" && candidateControlledToolNames.length > 0
    : shouldRequestExecutionPlan({
        inputText: input.inputText,
        allowedToolNames
      });
  
  if (shouldPlan) {
    plan = await generateAgentExecutionPlan({
        llmClient: input.runtime.llmClient,
        inputText: input.inputText,
        allowedTools: routeDecision
          ? candidateControlledToolNames
          : allowedToolNames,
        hasInitialGaps
      });
  }

  if (routeDecision) {
    contextAssembly.trace.routeDecision = routeDecision;
  }
  contextAssembly.trace.executionPlanStatus = plan.status;
  if (plan.error) {
    contextAssembly.trace.executionPlanError = plan.error;
  }
  if (plan.status !== "not_requested") {
    contextAssembly.trace.executionPlan = plan.steps;
  }
  const plannedToolSteps = plan.status === "generated"
    ? plan.steps.filter((step) => step.action === "tool" && step.tool)
    : [];
  const plannedToolNames = new Set(
    plannedToolSteps.flatMap((step) => (step.tool ? [step.tool] : []))
  );
  if (
    routeDecision?.mode === "plan_guided" &&
    plan.status === "generated" &&
    plan.steps.length === 0
  ) {
    contextAssembly.trace.planDeviations ??= [];
    contextAssembly.trace.planDeviations.push({
      round: 0,
      toolName: null,
      expectedTool: null,
      reason: "route_requested_plan_but_empty_execution_plan"
    });
  }

  const activeToolNames = (() => {
    if (!routeDecision) {
      return plan.status === "generated"
        ? plannedToolNames
        : new Set(allowedToolNames);
    }

    const names = new Set(nonControlledToolNames);
    if (routeDecision.mode === "plan_guided" && plan.status === "generated") {
      for (const toolName of plannedToolNames) {
        if (isControlledToolName(toolName)) {
          names.add(toolName);
        }
      }
    }
    return names;
  })();
  const activeTools = toolDefinitionsByNames(tools, activeToolNames);
  const executionAllowedTools =
    plan.status === "generated" || routeDecision
      ? new Set(activeTools.map((tool) => tool.function.name))
      : input.allowedTools;

  let nextPlannedToolIndex = 0;
  function recordActualToolCall(round: number, toolName: string): boolean {
    contextAssembly.trace.actualToolCalls ??= [];
    if (plan.status !== "generated") {
      contextAssembly.trace.actualToolCalls.push({
        round,
        toolName,
        plannedStep: null,
        status: "deviation"
      });
      contextAssembly.trace.planDeviations ??= [];
      contextAssembly.trace.planDeviations.push({
        round,
        toolName,
        expectedTool: null,
        reason: plan.status === "invalid" ? "planner_invalid" : "planner_not_requested"
      });
      return true;
    }

    const expected = plannedToolSteps[nextPlannedToolIndex];
    if (expected?.tool === toolName) {
      nextPlannedToolIndex += 1;
      contextAssembly.trace.actualToolCalls.push({
        round,
        toolName,
        plannedStep: expected.step,
        status: "planned"
      });
      return true;
    }

    contextAssembly.trace.actualToolCalls.push({
      round,
      toolName,
      plannedStep: null,
      status: "deviation"
    });
    contextAssembly.trace.planDeviations ??= [];
    contextAssembly.trace.planDeviations.push({
      round,
      toolName,
      expectedTool: expected?.tool ?? null,
      reason: expected ? "tool_out_of_order_or_unplanned" : "tool_call_after_plan_exhausted"
    });
    return false;
  }

  function recordMaxRoundToolCall(round: number, toolName: string) {
    contextAssembly.trace.actualToolCalls ??= [];
    const expected = plan.status === "generated"
      ? plannedToolSteps[nextPlannedToolIndex]
      : undefined;
    contextAssembly.trace.actualToolCalls.push({
      round,
      toolName,
      plannedStep: expected?.tool === toolName ? expected.step : null,
      status: "blocked_max_rounds"
    });
    contextAssembly.trace.planDeviations ??= [];
    contextAssembly.trace.planDeviations.push({
      round,
      toolName,
      expectedTool: expected?.tool ?? null,
      reason: "max_tool_rounds_exceeded"
    });
  }

  function executionError(message: string): AgentExecutionError {
    return new AgentExecutionError(message, JSON.stringify(contextAssembly.trace));
  }

  const searchResultFetchCandidates = new Map<
    string,
    { query: string; rank: number; title: string; url: string }
  >();
  const visitedUrls = new Set<string>();
  let searchQueryCount = 0;
  let fetchUrlCount = 0;

  function recordGuardrailEvent(input: {
    toolName: string;
    action: "allow" | "reject_content" | "throw_exception";
    reason: string;
    redactedArguments: Record<string, unknown>;
  }) {
    contextAssembly.trace.guardrailEvents ??= [];
    contextAssembly.trace.guardrailEvents.push(input);
  }

  async function blockedControlledToolResult(details: {
    toolName: ControlledToolName;
    reason: string;
    redactedArguments: Record<string, unknown>;
    status: "failed" | "succeeded";
  }): Promise<AgentToolResult> {
    const result: AgentToolResult = {
      responseText: `受控外部工具调用已被拦截：${details.reason}`,
      toolName: details.toolName,
      riskLevel: "external_send",
      input: details.redactedArguments,
      output: { blocked: true, reason: details.reason }
    };
    await recordToolCall({
      runtime: input.runtime,
      runId: input.runId,
      ownerTgUserId: input.ownerTgUserId,
      result,
      status: details.status,
      error: details.status === "failed" ? details.reason : null
    });
    return result;
  }

  function validateControlledToolCall(details: {
    toolName: string;
    args: Record<string, unknown>;
  }):
    | { action: "allow"; args: Record<string, unknown>; reason: string }
    | {
        action: "reject_content" | "throw_exception";
        reason: string;
        redactedArguments: Record<string, unknown>;
      } {
    if (!isControlledToolName(details.toolName)) {
      return { action: "allow", args: details.args, reason: "non-controlled tool" };
    }

    const redactedArguments: Record<string, unknown> = { ...details.args };
    const decision = routeDecision;
    if (!decision) {
      return { action: "allow", args: details.args, reason: "legacy route allowed" };
    }
    if (decision.mode !== "plan_guided") {
      return {
        action: "reject_content",
        reason: "controlled_tool_not_authorized",
        redactedArguments
      };
    }

    if (!decision.candidateTools.includes(details.toolName)) {
      return {
        action: "reject_content",
        reason: "controlled_tool_not_authorized",
        redactedArguments
      };
    }

    if (details.toolName === "web_search") {
      const query = stringArg(details.args, "query");
      redactedArguments.query = decision.searchPolicy.forbiddenTerms.reduce(
        (value, term) => value.replaceAll(term, "[redacted]"),
        query
      );
      if (searchQueryCount >= decision.searchPolicy.maxQueries) {
        return {
          action: "reject_content",
          reason: "query_not_allowed",
          redactedArguments
        };
      }
      const leakedTerm = decision.searchPolicy.forbiddenTerms.find((term) =>
        query.includes(term)
      );
      if (leakedTerm) {
        redactedArguments.query = String(redactedArguments.query).replaceAll(
          leakedTerm,
          "[redacted]"
        );
        return {
          action: "throw_exception",
          reason: "query_not_allowed",
          redactedArguments
        };
      }
      if (!query.trim()) {
        return {
          action: "reject_content",
          reason: "query_not_allowed",
          redactedArguments
        };
      }
      return { action: "allow", args: details.args, reason: "query_allowed" };
    }

    const rawUrl = stringArg(details.args, "url");
    redactedArguments.url = rawUrl;
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return {
        action: "throw_exception",
        reason: "url_not_allowed",
        redactedArguments
      };
    }

    const normalizedUrl = normalizeExternalUrl(rawUrl);
    if (!normalizedUrl) {
      return {
        action: "throw_exception",
        reason: "url_not_allowed",
        redactedArguments
      };
    }
    if (isPrivateOrLocalHost(parsed.hostname)) {
      return {
        action: "throw_exception",
        reason: "private_network_url_blocked",
        redactedArguments
      };
    }
    if (fetchUrlCount >= decision.fetchPolicy.maxUrls) {
      return {
        action: "reject_content",
        reason: "url_not_allowed",
        redactedArguments
      };
    }

    const explicitAllowed = decision.fetchPolicy.explicitAllowedUrls.some(
      (url) => normalizeExternalUrl(url) === normalizedUrl
    );
    const searchCandidate = searchResultFetchCandidates.get(normalizedUrl);
    const DOMAIN_ALIASES: Record<string, string[]> = {
      "github.com": ["githubusercontent.com"]
    };

    const domainAllowed = decision.fetchPolicy.allowedDomains.some((domain) => {
      if (parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)) {
        return true;
      }
      
      // Handle known aliases (e.g. github.com -> githubusercontent.com)
      for (const [baseDomain, aliases] of Object.entries(DOMAIN_ALIASES)) {
        if (domain === baseDomain || domain.endsWith(`.${baseDomain}`)) {
          if (aliases.some(alias => parsed.hostname === alias || parsed.hostname.endsWith(`.${alias}`))) {
            return true;
          }
        }
      }
      
      return false;
    });

    if (
      decision.privacyRisk === "low" ||
      explicitAllowed ||
      domainAllowed ||
      (decision.fetchPolicy.allowSearchResultUrls && searchCandidate)
    ) {
      return {
        action: "allow",
        args: { ...details.args, url: normalizedUrl },
        reason: decision.privacyRisk === "low"
          ? "low_privacy_risk_allowed"
          : explicitAllowed
            ? "url_allowed"
            : domainAllowed
              ? "domain_allowed"
              : "search_result_url_allowed_for_run"
      };
    }

    return {
      action: "reject_content",
      reason: decision.fetchPolicy.allowSearchResultUrls
        ? "search_result_url_not_allowed"
        : "url_not_allowed",
      redactedArguments
    };
  }

  let planInstruction = "";
  if (plan.status === "generated" && plan.steps.length > 0) {
    planInstruction = [
      "你的执行计划已定，请按计划中的工具范围执行；如果需要偏离，先用文字解释原因。",
      ...plan.steps.map((step) =>
        step.action === "tool"
          ? `步骤 ${step.step}: 调用工具 ${step.tool} (${step.reason})`
          : `步骤 ${step.step}: ${step.action} (${step.reason})`
      )
    ].join("\n");
  } else if (plan.status === "generated") {
    planInstruction = "Planner 判断当前请求不需要调用工具，请直接回答或询问澄清问题。";
  }

  const systemInstructions = [
    "你是一个个人 Telegram agent。",
    profileContext,
    "需要联网信息时先使用 web_search；需要读取具体网页时使用 fetch_url。",
    "使用搜索或网页内容回答时，必须包含来源 URL。",
    "当你使用了 web_search 或 fetch_url 收集到信息后，必须使用 submit_answer 工具提交最终回答，并严格引用来源。否则，你可以直接输出文本回答。",
    "删除记忆只能通过 delete_memory_request 创建确认，不能直接删除。",
    "如果用户正在回答你发起的初始化采访或盲区追问，请保持专注，直到收集到完整信息，不要轻易跳出采访场景并结束采访。",
    "当你完成一项采访，或者获得关于用户性格（personality_framework）、健康（health_log）、人际关系（relationship_note）的完整描述时，必须调用 save_interview_source 将其存为原始资料。如果有关联的 Gap ID，必须在 resolveGapId 中传入以关闭对应的 Gap。",
    hasInitialGaps ? "【强主动拦截规则】系统存在未解决的核心初始化Gap，你当前的最高优先级是发起或继续Onboarding访谈，强引导用户回答以填补这些Gap，而不是单纯回应闲聊。" : "",
    contextAssembly.contextString,
    input.systemInstructions ?? "",
    planInstruction
  ]
    .filter(Boolean)
    .join("\n");

  const recentRuns = await input.runtime.repositories.listRunsForSession(input.ownerTgUserId, input.sessionId);
  const activeSession = await input.runtime.repositories.getActiveChatSession(input.ownerTgUserId);

  let themeSummary = activeSession?.themeSummary || null;
  let unsummarizedRuns = recentRuns.filter(r => r.status === "succeeded" && r.messageText && r.responseText && r.id !== input.runId);

  if (activeSession?.summarizedUpToRunId) {
    const summarizedIndex = unsummarizedRuns.findIndex(r => r.id === activeSession.summarizedUpToRunId);
    if (summarizedIndex !== -1) {
      unsummarizedRuns = unsummarizedRuns.slice(summarizedIndex + 1);
    }
  }

  const MAX_UNSUMMARIZED_RUNS = 20;
  if (unsummarizedRuns.length > MAX_UNSUMMARIZED_RUNS) {
    const runsToCompress = unsummarizedRuns.slice(0, 10);
    const newSummarizedUpTo = runsToCompress[runsToCompress.length - 1].id;
    const oldSummaryText = themeSummary ? `【当前主题摘要】\n${themeSummary}\n` : "";
    const newInteractionsText = runsToCompress.map(r => `User: ${r.messageText}\nAgent: ${r.responseText}`).join("\n");
    const compressionPrompt = `你是一个长记忆压缩器。请将【旧摘要】与【新增对话片段】合并成一段最新的全局摘要，必须保留用户的核心需求和上下文设定。只返回压缩后的纯文本，不要包含任何前缀。
${oldSummaryText}
【新增对话片段】
${newInteractionsText}`;

    const compressionResult = await input.runtime.llmClient.createChatCompletion({
      messages: [{ role: "user", content: compressionPrompt }],
      tools: [],
      thinkingTier: "none"
    });
    
    themeSummary = compressionResult.content;
    await input.runtime.repositories.updateChatSession(input.sessionId, {
      themeSummary,
      summarizedUpToRunId: newSummarizedUpTo,
      updatedAt: input.runtime.now()
    });
    
    unsummarizedRuns = unsummarizedRuns.slice(10);
  }

  const historyMessages = unsummarizedRuns.flatMap(run => [
    { role: "user" as const, content: run.messageText! },
    { role: "assistant" as const, content: run.responseText! }
  ]);

  const finalSystemInstructions = themeSummary 
    ? `${systemInstructions}\n\n【本轮对话主题与摘要（长期上下文）】\n${themeSummary}`
    : systemInstructions;

  const messages: LlmMessage[] = [
    { role: "system", content: finalSystemInstructions },
    ...historyMessages,
    { role: "user", content: input.inputText }
  ];

  for (let round = 0; round <= input.maxToolRounds; round += 1) {
    await input.onThinking?.({ type: "thinking" }).catch(() => {});
    const completion = await input.runtime.llmClient.createChatCompletion({
      messages,
      tools: activeTools,
      thinkingTier: input.thinkingTier ?? "high"
    });
    await recordLlmCall({
      runtime: input.runtime,
      runId: input.runId,
      ownerTgUserId: input.ownerTgUserId,
      messages,
      output: completion
    });

    if (completion.toolCalls.length === 0) {
      if (visitedUrls.size > 0 && !completion.content.includes(UNTRUSTED_INSTRUCTION_WARNING)) {
        throw executionError("无法找到可靠来源来支持该结论。");
      }
      if (plan.status === "generated") {
        for (const remaining of plannedToolSteps.slice(nextPlannedToolIndex)) {
          contextAssembly.trace.planDeviations ??= [];
          contextAssembly.trace.planDeviations.push({
            round,
            toolName: null,
            expectedTool: remaining.tool ?? null,
            reason: "planned_tool_not_used"
          });
        }
      }

      let responseText = completion.content || "我暂时没有生成有效回复。";

      // Trigger heuristics for post-response reflection
      const triggerKeywords = ["记", "喜欢", "习惯", "偏好", "希望", "不要", "错", "改", "不是", "不符合", "以前", "以后", "博客", "文章", "性格", "焦虑", "失眠", "作息", "经常", "总是", "关系", "吵架", "沟通", "价值观", "潜意识", "mbti", "性格"];
      const matchesKeyword = triggerKeywords.some(kw => input.inputText.includes(kw));
      const matchesScenario = contextAssembly.trace.scenario !== "global";

      if (matchesKeyword || matchesScenario) {
        const existingClaims = await input.runtime.repositories.listPersonalModelClaims({
          ownerTgUserId: input.ownerTgUserId,
          limit: 100
        });
        const proposals = await reflectAndProposeClaims({
          llmClient: input.runtime.llmClient,
          inputText: input.inputText,
          responseText,
          existingClaims
        });

        if (proposals.length > 0) {
          const now = input.runtime.now();
          for (const prop of proposals) {
            const claimId = crypto.randomUUID();
            await input.runtime.repositories.createPersonalModelClaim({
              id: claimId,
              ownerTgUserId: input.ownerTgUserId,
              claim: prop.claim,
              layer: prop.layer,
              scenario: prop.scenario,
              confidence: "low",
              status: "proposed",
              usagePolicy: "default_available",
              sensitivity: "low",
              validFrom: null,
              validUntil: null,
              lastConfirmedAt: null,
              metadataJson: JSON.stringify({ reason: prop.reason, runId: input.runId }),
              createdAt: now,
              updatedAt: now
            });

            await input.runtime.repositories.createPersonalModelEvent({
              id: crypto.randomUUID(),
              claimId,
              ownerTgUserId: input.ownerTgUserId,
              eventType: "proposed",
              payloadJson: JSON.stringify({ runId: input.runId, reason: prop.reason }),
              createdAt: now
            });

            await input.runtime.repositories.createPersonalModelMetacognitionLog({
              id: crypto.randomUUID(),
              ownerTgUserId: input.ownerTgUserId,
              relatedClaimId: claimId,
              relatedGapId: null,
              reflectionType: "observation",
              content: `提出理解建议："${prop.claim}"。原因：${prop.reason}`,
              createdAt: now
            });
          }

          // Append lightweight tip to the Telegram response
          responseText += `\n\n💡 我可以把关于“${proposals[0].claim}”的理解作为低置信观察保存，你可以在管理后台确认或拒绝它。`;
        }
      }

      return {
        responseText,
        toolName: "llm_agent",
        riskLevel: "external_send",
        input: { text: input.inputText },
        output: { content: completion.content },
        contextTraceJson: JSON.stringify(contextAssembly.trace)
      };
    }

    if (round >= input.maxToolRounds) {
      for (const toolCall of completion.toolCalls) {
        recordMaxRoundToolCall(round, toolCall.function.name);
      }
      throw executionError("LLM tool round limit exceeded");
    }

    messages.push({
      role: "assistant",
      content: completion.content || null,
      tool_calls: completion.toolCalls
    });

    for (const toolCall of completion.toolCalls) {
      await input.onThinking?.({ type: "tool", toolName: toolCall.function.name }).catch(() => {});
      const toolCallAllowedByPlan = recordActualToolCall(round, toolCall.function.name);
      const toolArgs = safeJson(toolCall.function.arguments);
      
      if (toolCall.function.name === "submit_answer") {
        const text = stringArg(toolArgs, "text");
        const citations = Array.isArray(toolArgs.citations) ? toolArgs.citations : [];
        const hasUsedSearch = visitedUrls.size > 0;
        
        if (hasUsedSearch) {
          if (citations.length === 0) {
            throw executionError("无法找到可靠来源来支持该结论。");
          }
          for (const cite of citations) {
            const citeRaw = (cite as Record<string, unknown>)?.url;
            const citeUrl = typeof citeRaw === "string" ? normalizeExternalUrl(citeRaw) : null;
            
            let isValid = false;
            if (citeUrl) {
              const explicitUrls = input.plannerRouteDecision?.fetchPolicy.explicitAllowedUrls || [];
              if (visitedUrls.has(citeUrl) || explicitUrls.some((u: string) => normalizeExternalUrl(u) === citeUrl)) {
                isValid = true;
              } else {
                try {
                  const citeDomain = new URL(citeUrl).hostname.replace(/^www\./, '');
                  const validDomains = new Set<string>();
                  for (const u of [...visitedUrls, ...explicitUrls]) {
                    try {
                      validDomains.add(new URL(u).hostname.replace(/^www\./, ''));
                    } catch {}
                  }
                  
                  for (const domain of validDomains) {
                    if (domain === citeDomain || domain.endsWith(`.${citeDomain}`) || citeDomain.endsWith(`.${domain}`)) {
                      isValid = true;
                      break;
                    }
                    if (
                      (domain.includes("githubusercontent.com") && citeDomain.includes("github.com")) ||
                      (domain.includes("github.com") && citeDomain.includes("githubusercontent.com"))
                    ) {
                      isValid = true;
                      break;
                    }
                  }
                } catch {}
              }
            }

            if (!isValid) {
              throw executionError("无法找到可靠来源来支持该结论。");
            }
          }
        }
        
        let responseText = text;
        if (citations.length > 0) {
          responseText += "\n\n**参考来源：**\n" + citations.map((c: any, i: number) => `[${i + 1}] [${c.title || c.url}](${c.url})`).join("\n");
        }
        
        const toolResult: AgentToolResult = {
          responseText,
          toolName: "llm_agent",
          riskLevel: "read",
          input: toolArgs,
          output: { submitted: true },
          contextTraceJson: JSON.stringify(contextAssembly.trace)
        };
        
        await recordToolCall({
          runtime: input.runtime,
          runId: input.runId,
          ownerTgUserId: input.ownerTgUserId,
          result: toolResult,
          status: "succeeded"
        });
        
        return toolResult;
      }
      
      const controlledTool = isControlledToolName(toolCall.function.name);
      const guardrail = controlledTool
        ? validateControlledToolCall({
            toolName: toolCall.function.name,
            args: toolArgs
          })
        : { action: "allow" as const, args: toolArgs, reason: "non-controlled tool" };
      let toolResult: AgentToolResult;
      try {
        if (guardrail.action !== "allow") {
          recordGuardrailEvent({
            toolName: toolCall.function.name,
            action: guardrail.action,
            reason: guardrail.reason,
            redactedArguments: guardrail.redactedArguments
          });
          if (guardrail.action === "throw_exception") {
            await blockedControlledToolResult({
              toolName: toolCall.function.name as ControlledToolName,
              reason: guardrail.reason,
              redactedArguments: guardrail.redactedArguments,
              status: "failed"
            });
            throw executionError(guardrail.reason);
          }
          toolResult = await blockedControlledToolResult({
            toolName: toolCall.function.name as ControlledToolName,
            reason: guardrail.reason,
            redactedArguments: guardrail.redactedArguments,
            status: "failed"
          });
        } else {
          if (controlledTool) {
            recordGuardrailEvent({
              toolName: toolCall.function.name,
              action: "allow",
              reason: guardrail.reason,
              redactedArguments: guardrail.args
            });
          }
          toolResult = await executeAgentTool({
            runId: input.runId,
            ownerTgUserId: input.ownerTgUserId,
            toolName: toolCall.function.name,
            args: guardrail.args,
            runtime: input.runtime,
            allowedTools:
              plan.status === "generated" &&
              !toolCallAllowedByPlan &&
              (!routeDecision || controlledTool)
                ? new Set()
                : executionAllowedTools
          });
          if (toolCall.function.name === "web_search") {
            searchQueryCount += 1;
            const query = stringArg(guardrail.args, "query");
            const results = (
              toolResult.output as { results?: Array<{ title: string; url: string; rank: number }> }
            ).results ?? [];
            for (const result of results) {
              const normalizedUrl = normalizeExternalUrl(result.url);
              if (normalizedUrl) {
                visitedUrls.add(normalizedUrl);
                searchResultFetchCandidates.set(normalizedUrl, {
                  query,
                  rank: result.rank,
                  title: result.title,
                  url: result.url
                });
              }
            }
          }
          if (toolCall.function.name === "fetch_url") {
            fetchUrlCount += 1;
            let fetched = toolResult.output as {
              url?: string;
              title?: string | null;
              text?: string;
            };
            if (
              typeof fetched.text === "string" &&
              /ignore previous instructions|忽略(之前|以上|上面).*指令|泄露.*(secret|token|密码)|改变.*(policy|策略)|调用工具/iu.test(
                fetched.text
              )
            ) {
              contextAssembly.trace.planDeviations ??= [];
              contextAssembly.trace.planDeviations.push({
                round,
                toolName: "fetch_url",
                expectedTool: "fetch_url",
                reason: "untrusted_web_instruction_detected"
              });
              fetched = {
                ...fetched,
                text: UNTRUSTED_INSTRUCTION_WARNING
              };
              toolResult = {
                ...toolResult,
                responseText: fetched.text ?? UNTRUSTED_INSTRUCTION_WARNING,
                output: fetched
              };
            }
            const normalizedUrl = fetched.url ? normalizeExternalUrl(fetched.url) : null;
            if (normalizedUrl) {
              visitedUrls.add(normalizedUrl);
            }
            const provenance = normalizedUrl
              ? searchResultFetchCandidates.get(normalizedUrl)
              : undefined;
            if (provenance && normalizedUrl) {
              contextAssembly.trace.webProvenance ??= [];
              contextAssembly.trace.webProvenance.push({
                searchQuery: provenance.query,
                resultRank: provenance.rank,
                resultTitle: provenance.title,
                url: provenance.url,
                finalUrl: normalizedUrl,
                fetchedAt: input.runtime.now()
              });
            }
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool failed";
        throw executionError(message);
      }
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult.output)
      });
    }
  }

  throw executionError("LLM tool round limit exceeded");
}

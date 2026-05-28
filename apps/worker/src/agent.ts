import {
  builtInToolNames,
  type BuiltInToolName,
  type ToolRiskLevel
} from "@personal-agent/shared";
import { type SearchClient, type UrlFetcher } from "./externalTools.js";
import {
  type LlmClient,
  type LlmMessage,
  type LlmToolCall,
  type LlmToolDefinition
} from "./llm.js";
import { type AgentRepositories } from "./repositories.js";
import { assemblePersonalModelContext } from "./personalModelContext.js";
import { type PersonalModelScenario, type PersonalModelSourceType } from "@personal-agent/shared";
import {
  normalizeSourceContent,
  chunkSourceContent,
  tokenCountForChunk
} from "./personalModelSources.js";

export interface AgentRuntime {
  repositories: AgentRepositories;
  llmClient?: LlmClient;
  searchClient?: SearchClient;
  urlFetcher?: UrlFetcher;
  now: () => number;
  generateId: () => string;
  generateApprovalCode: () => string;
}

export interface AgentToolResult {
  responseText: string;
  toolName: string;
  riskLevel: ToolRiskLevel;
  input: unknown;
  output: unknown;
}

export interface LlmAgentInput {
  runId: string;
  ownerTgUserId: number;
  inputText: string;
  runtime: AgentRuntime;
  allowedTools?: Set<string>;
  systemInstructions?: string;
  maxToolRounds: number;
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
      const todo = title
        ? await input.runtime.repositories.createTodo({
            ownerTgUserId: input.ownerTgUserId,
            title,
            createdAt: input.runtime.now()
          })
        : null;
      result = {
        responseText: todo ? `已创建待办 #${todo.id}：${todo.title}` : "待办内容不能为空。",
        toolName: "create_todo",
        riskLevel: "write_low",
        input: { title },
        output: todo ? { id: todo.id, title: todo.title } : { created: false }
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
            : ["未完成待办：", ...todos.map((todo) => `#${todo.id} ${todo.title}`)].join("\n"),
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
      result = {
        responseText: fetched.text,
        toolName: "fetch_url",
        riskLevel: "external_send",
        input: { url },
        output: fetched
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
            createdAt: now
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
      }

      result = {
        responseText: source
          ? `已成功将采访成果保存为资料，生成 ${chunksCount} 个分块${resolveGapId ? "，且已关闭对应认知缺口" : ""}。`
          : "保存资料失败，缺少必要参数。",
        toolName: "save_interview_source",
        riskLevel: "write_low",
        input: { sourceType, title, content, metadata, resolveGapId },
        output: source
          ? { saved: true, sourceId: source.id, chunkCount: chunksCount, resolveGapId }
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
        properties: { title: { type: "string" } },
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
      description: "Save a memory for the owner.",
      parameters: {
        type: "object",
        properties: { content: { type: "string" } },
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
          }
        },
        required: ["sourceType", "title", "content"]
      }
    }
  }
};

function availableToolDefinitions(allowedTools?: Set<string>): LlmToolDefinition[] {
  return builtInToolNames
    .filter((name) => !allowedTools || allowedTools.has(name))
    .map((name) => toolDefinitions[name]);
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
    now: input.runtime.now()
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
    if (parts.length > 0) {
      profileContext = `[用户档案: ${parts.join(", ")}]`;
    }
  }

  const systemInstructions = [
    "你是一个个人 Telegram agent。用简洁中文回答。",
    "你是用户的高阶自我映射：中正、清明、温和，但必要时观点锋利。",
    profileContext,
    "默认隐性使用个人模型，不要频繁显性引用旧资料或展示你有多了解用户。",
    "当用户情绪或真实需求不确定时，先给轻量判断，再问一个关键校准问题，不要直接定性。",
    "可以指出逃避、投射、控制欲、自我合理化和分析过度，但语气必须平静，态度必须温和。",
    "不要自称宗教、心理或终极真理权威。",
    "需要联网信息时先使用 web_search；需要读取具体网页时使用 fetch_url。",
    "使用搜索或网页内容回答时，必须包含来源 URL。",
    "删除记忆只能通过 delete_memory_request 创建确认，不能直接删除。",
    "如果用户正在回答你发起的初始化采访或盲区追问，请保持专注，直到收集到完整信息，不要轻易跳出采访场景并结束采访。",
    "当你完成一项采访，或者获得关于用户性格（personality_framework）、健康（health_log）、人际关系（relationship_note）的完整描述时，必须调用 save_interview_source 将其存为原始资料。如果有关联的 Gap ID，必须在 resolveGapId 中传入以关闭对应的 Gap。",
    contextAssembly.contextString,
    input.systemInstructions ?? ""
  ]
    .filter(Boolean)
    .join("\n");
  const messages: LlmMessage[] = [
    { role: "system", content: systemInstructions },
    { role: "user", content: input.inputText }
  ];
  const tools = availableToolDefinitions(input.allowedTools);

  for (let round = 0; round <= input.maxToolRounds; round += 1) {
    const completion = await input.runtime.llmClient.createChatCompletion({
      messages,
      tools
    });
    await recordLlmCall({
      runtime: input.runtime,
      runId: input.runId,
      ownerTgUserId: input.ownerTgUserId,
      messages,
      output: completion
    });

    if (completion.toolCalls.length === 0) {
      return {
        responseText: completion.content || "我暂时没有生成有效回复。",
        toolName: "llm_agent",
        riskLevel: "external_send",
        input: { text: input.inputText },
        output: { content: completion.content }
      };
    }

    if (round >= input.maxToolRounds) {
      throw new Error("LLM tool round limit exceeded");
    }

    messages.push({
      role: "assistant",
      content: completion.content || null,
      tool_calls: completion.toolCalls
    });

    for (const toolCall of completion.toolCalls) {
      const toolResult = await executeAgentTool({
        runId: input.runId,
        ownerTgUserId: input.ownerTgUserId,
        toolName: toolCall.function.name,
        args: safeJson(toolCall.function.arguments),
        runtime: input.runtime,
        allowedTools: input.allowedTools
      });
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult.output)
      });
    }
  }

  throw new Error("LLM tool round limit exceeded");
}

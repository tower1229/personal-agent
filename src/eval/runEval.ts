import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createApprovalRequest } from "../db/approvals.js";
import { createEvalResult, createEvalRun, finishEvalRun } from "../db/evals.js";
import { createMockLlmClient } from "../llm/mockClient.js";
import { type LlmClient } from "../llm/types.js";
import { handleUserTextMessage } from "../services/messageHandler.js";
import { executeRegisteredTool } from "../tools/registry.js";
import { scoreEvalCase } from "./scoring.js";
import {
  type EvalCase,
  type EvalExecutionResult,
  type EvalSetupAction
} from "./types.js";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function loadCases(): Promise<EvalCase[]> {
  const filePath = resolve(process.cwd(), "eval/cases.json");
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as EvalCase[];
}

function parseDueAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function runSetupAction(input: {
  action: EvalSetupAction;
  userId: string;
  chatId: string;
}): Promise<void> {
  const context = {
    userId: input.userId,
    chatId: input.chatId,
    runId: null
  };

  switch (input.action.type) {
    case "create_todo":
      await executeRegisteredTool({
        toolName: "create_todo",
        argsJson: JSON.stringify({
          title: input.action.title,
          due_at: parseDueAt(input.action.dueAt)?.toISOString() ?? null
        }),
        context
      });
      return;
    case "save_memory":
      await executeRegisteredTool({
        toolName: "save_memory",
        argsJson: JSON.stringify({
          type: input.action.memoryType,
          content: input.action.content,
          confidence: input.action.confidence ?? 80,
          importance: input.action.importance ?? 50,
          source: input.action.source ?? "eval-setup"
        }),
        context
      });
      return;
    case "add_document":
      await executeRegisteredTool({
        toolName: "add_document",
        argsJson: JSON.stringify({
          title: input.action.title,
          content: input.action.content,
          sourceType: input.action.sourceType ?? "text"
        }),
        context
      });
      return;
    case "add_document_for_other_user":
      await executeRegisteredTool({
        toolName: "add_document",
        argsJson: JSON.stringify({
          title: input.action.title,
          content: input.action.content,
          sourceType: input.action.sourceType ?? "text"
        }),
        context: {
          ...context,
          userId: `${input.userId}-other`
        }
      });
      return;
    case "create_pending_approval":
      await createApprovalRequest({
        userId: input.userId,
        chatId: input.chatId,
        runId: null,
        toolName: input.action.toolName,
        toolArgsJson: JSON.stringify(input.action.args),
        summary: `eval pending approval setup for ${input.action.toolName}`,
        riskLevel: "destructive",
        expiresAt:
          typeof input.action.expiresAtOffsetMs === "number"
            ? new Date(Date.now() + input.action.expiresAtOffsetMs)
            : null,
        operationSummaryJson: JSON.stringify({
          summary: `eval pending approval setup for ${input.action.toolName}`,
          operationPreview: {
            operation: input.action.toolName,
            args: input.action.args
          }
        }),
        approvalCode: input.action.approvalCode ?? null,
        executedToolCallId: null
      });
      return;
  }
}

async function runCaseSetup(input: {
  evalCase: EvalCase;
  userId: string;
  chatId: string;
}): Promise<void> {
  for (const action of input.evalCase.setup ?? []) {
    await runSetupAction({
      action,
      userId: input.userId,
      chatId: input.chatId
    });
  }
}

async function executeCase(input: {
  evalCase: EvalCase;
  userId: string;
  chatId: string;
  llmClient?: LlmClient;
}): Promise<EvalExecutionResult> {
  const startedAt = new Date();

  try {
    const result = await handleUserTextMessage({
      input: input.evalCase.input,
      userId: input.userId,
      chatId: input.chatId,
      metadata: {
        source: "eval",
        case_id: input.evalCase.id
      },
      llmClient: input.llmClient
    });

    return {
      output: result.output,
      runId: result.runId,
      error: null,
      startedAt
    };
  } catch (error) {
    return {
      output: "",
      runId: null,
      error: toErrorMessage(error),
      startedAt
    };
  }
}

async function main(): Promise<void> {
  const useMock = process.argv.includes("--mock");

  if (useMock) {
    process.env.EVAL_MOCK = "1";
  }

  const llmClient = useMock ? createMockLlmClient() : undefined;
  const cases = await loadCases();
  const evalRun = await createEvalRun({
    total: cases.length
  });
  const evalUserId = `eval-user-${evalRun.id}`;
  const evalChatId = `eval-chat-${evalRun.id}`;
  let passed = 0;
  let failed = 0;

  console.log(
    `Starting ${useMock ? "mock " : ""}eval run ${evalRun.id} with ${
      cases.length
    } cases`
  );
  console.log(`Eval identity: userId=${evalUserId} chatId=${evalChatId}`);

  for (const evalCase of cases) {
    try {
      await runCaseSetup({
        evalCase,
        userId: evalUserId,
        chatId: evalChatId
      });
    } catch (error) {
      console.error(`Setup failed for ${evalCase.id}:`, error);
    }

    const result = await executeCase({
      evalCase,
      userId: evalUserId,
      chatId: evalChatId,
      llmClient
    });
    const score = await scoreEvalCase({
      evalCase,
      result,
      userId: evalUserId,
      chatId: evalChatId
    });

    if (score.passed) {
      passed += 1;
    } else {
      failed += 1;
    }

    await createEvalResult({
      evalRunId: evalRun.id,
      caseId: evalCase.id,
      category: evalCase.category,
      input: evalCase.input,
      output: result.output,
      passed: score.passed,
      scoreJson: JSON.stringify(score),
      error: result.error,
      createdAt: new Date()
    });

    console.log(
      [
        score.passed ? "PASS" : "FAIL",
        evalCase.id,
        evalCase.category,
        score.failureReasons.length
          ? `reasons=${score.failureReasons.join("; ")}`
          : "reasons=none",
        result.error ? `error=${result.error}` : `output=${result.output.slice(0, 120)}`
      ].join(" | ")
    );
  }

  await finishEvalRun({
    id: evalRun.id,
    total: cases.length,
    passed,
    failed
  });

  const passRate = cases.length === 0 ? 0 : (passed / cases.length) * 100;

  console.log(
    `Eval complete: total=${cases.length} passed=${passed} failed=${failed} passRate=${passRate.toFixed(1)}%`
  );
}

main().catch((error) => {
  console.error("Eval runner failed:", error);
  process.exit(1);
});

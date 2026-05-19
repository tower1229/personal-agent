import OpenAI from "openai";
import { env } from "../config/env.js";
import { listDocuments } from "../db/documents.js";
import { listImportantMemories } from "../db/memories.js";
import { listOpenTodos } from "../db/todos.js";
import { emitProgress, type ProgressHandler } from "../services/progress.js";
import {
  completeWorkflowStep,
  createWorkflow,
  createWorkflowStep,
  failWorkflowStep,
  updateWorkflowStatus
} from "../db/workflows.js";
import {
  type DailyBriefWorkflowInput,
  type WorkflowRunResult
} from "./types.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL
});

const timeoutMs = 30_000;

export class DailyBriefWorkflowError extends Error {
  constructor(
    message: string,
    readonly workflowId: number
  ) {
    super(message);
    this.name = "DailyBriefWorkflowError";
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

async function runStep<T>(input: {
  workflowId: number;
  stepName: string;
  input?: unknown;
  onProgress?: ProgressHandler;
  run: () => Promise<T>;
}): Promise<T> {
  const step = await createWorkflowStep({
    workflowId: input.workflowId,
    stepName: input.stepName,
    inputJson: input.input === undefined ? null : toJson(input.input)
  });

  try {
    await emitProgress(input.onProgress, {
      type: "workflow_step",
      message: `工作流步骤：${input.stepName}`,
      workflowStep: input.stepName
    });

    const output = await input.run();

    await completeWorkflowStep({
      id: step.id,
      outputJson: toJson(output)
    });
    await emitProgress(input.onProgress, {
      type: "workflow_step",
      message: `工作流步骤完成：${input.stepName}`,
      workflowStep: input.stepName,
      outcome: "succeeded"
    });

    return output;
  } catch (error) {
    await failWorkflowStep({
      id: step.id,
      error: toErrorMessage(error)
    });
    await emitProgress(input.onProgress, {
      type: "workflow_step",
      message: `工作流步骤失败：${input.stepName}`,
      workflowStep: input.stepName,
      outcome: "failed"
    });
    throw error;
  }
}

async function generateBriefText(input: {
  todos: unknown[];
  memories: unknown[];
  documents: unknown[];
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "你是个人 Agent 的 daily brief 生成器。",
          "必须用中文回复。",
          "不要使用 Markdown 原文格式。",
          "如果没有待办、记忆或文档，就明确说暂无。",
          "输出要简洁、可执行。",
          "简报应包括：今日待办、重要记忆或偏好、相关文档或项目背景、建议行动。"
        ].join(" ")
      },
      {
        role: "user",
        content: toJson(input)
      }
    ],
    stream: false
  }, {
    timeout: timeoutMs
  });

  const output = completion.choices[0]?.message?.content?.trim();

  if (!output) {
    throw new Error("Model returned an empty daily brief");
  }

  return output;
}

export async function runDailyBriefWorkflow(
  input: DailyBriefWorkflowInput & { onProgress?: ProgressHandler }
): Promise<WorkflowRunResult> {
  const workflow = await createWorkflow({
    userId: input.userId,
    runId: input.runId,
    type: "daily_brief",
    inputJson: toJson({
      chatId: input.chatId,
      triggerMessage: input.triggerMessage
    })
  });

  try {
    const todos = await runStep({
      workflowId: workflow.id,
      stepName: "list_open_todos",
      input: {
        userId: input.userId
      },
      onProgress: input.onProgress,
      run: () => listOpenTodos(input.userId)
    });

    const memories = await runStep({
      workflowId: workflow.id,
      stepName: "load_important_memories",
      input: {
        userId: input.userId,
        limit: 10
      },
      onProgress: input.onProgress,
      run: () =>
        listImportantMemories({
          userId: input.userId,
          limit: 10
        })
    });

    const documents = await runStep({
      workflowId: workflow.id,
      stepName: "search_recent_documents",
      input: {
        userId: input.userId
      },
      onProgress: input.onProgress,
      run: () => listDocuments(input.userId)
    });

    const brief = await runStep({
      workflowId: workflow.id,
      stepName: "generate_brief",
      input: {
        todoCount: todos.length,
        memoryCount: memories.length,
        documentCount: documents.length
      },
      onProgress: input.onProgress,
      run: () =>
        generateBriefText({
          todos,
          memories,
          documents
        })
    });

    await runStep({
      workflowId: workflow.id,
      stepName: "save_result",
      input: {
        outputLength: brief.length
      },
      onProgress: input.onProgress,
      run: async () => {
        await updateWorkflowStatus({
          id: workflow.id,
          userId: input.userId,
          status: "succeeded",
          outputJson: toJson({
            brief
          })
        });

        return {
          saved: true
        };
      }
    });

    return {
      workflowId: workflow.id,
      output: brief
    };
  } catch (error) {
    const errorMessage = toErrorMessage(error);

    await updateWorkflowStatus({
      id: workflow.id,
      userId: input.userId,
      status: "failed",
      outputJson: toJson({
        error: errorMessage
      })
    });

    throw new DailyBriefWorkflowError(errorMessage, workflow.id);
  }
}

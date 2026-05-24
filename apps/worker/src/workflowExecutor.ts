import {
  builtInToolNames,
  type WorkflowSkillStep
} from "@personal-agent/shared";
import { executeAgentTool, executeLlmAgent } from "./agent.js";
import { executeCommand, type BotRuntime } from "./bot.js";
import { type WorkflowSkillPayload } from "./types.js";

interface WorkflowStepAdapter {
  do(name: string, callback: () => Promise<unknown>): Promise<unknown>;
  sleep(name: string, durationMs: number): Promise<void>;
}

function stepCommandText(step: WorkflowSkillStep, inputText: string): string {
  const candidate = step.input?.text;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : inputText;
}

function waitDurationMs(step: WorkflowSkillStep): number {
  const candidate = step.input?.durationMs;
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? Math.max(0, Math.trunc(candidate))
    : 0;
}

function telegramText(step: WorkflowSkillStep, fallback: string): string {
  const candidate = step.input?.text;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : fallback;
}

function stepText(step: WorkflowSkillStep, fallback: string): string {
  const candidate = step.input?.text ?? step.input?.prompt ?? step.input?.query;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : fallback;
}

export async function executeWorkflowSkillRun(input: {
  payload: WorkflowSkillPayload;
  runtime: BotRuntime;
  stepAdapter?: WorkflowStepAdapter;
}): Promise<string> {
  const adapter =
    input.stepAdapter ??
    ({
      async do(_name, callback) {
        return callback();
      },
      async sleep() {
        return;
      }
    } satisfies WorkflowStepAdapter);
  const manifest = input.payload.manifest;
  const allowedTools = new Set(
    manifest.allowedTools.filter((tool) =>
      builtInToolNames.includes(tool as (typeof builtInToolNames)[number])
    )
  );
  let lastOutput = "";

  try {
    for (const workflowStep of manifest.workflowTemplate) {
      const stepRecord = await input.runtime.repositories.createWorkflowStep({
        id: input.runtime.generateId(),
        workflowRunId: input.payload.workflowRunId,
        ownerTgUserId: input.payload.ownerTgUserId,
        stepId: workflowStep.id,
        stepType: workflowStep.type,
        status: "running",
        inputJson: JSON.stringify(workflowStep.input ?? {}),
        outputJson: null,
        error: null,
        startedAt: input.runtime.now(),
        completedAt: null,
        createdAt: input.runtime.now()
      });

      try {
        let output: unknown;

        if (workflowStep.type === "tool") {
          const commandText = stepCommandText(workflowStep, input.payload.inputText);
          const result = (await adapter.do(workflowStep.id, () =>
            executeCommand({
              runId: input.payload.runId,
              ownerTgUserId: input.payload.ownerTgUserId,
              text: commandText,
              runtime: input.runtime,
              allowedTools
            })
          )) as Awaited<ReturnType<typeof executeCommand>>;
          lastOutput = result.responseText;
          await input.runtime.repositories.recordToolCall({
            id: input.runtime.generateId(),
            runId: input.payload.runId,
            ownerTgUserId: input.payload.ownerTgUserId,
            toolName: result.toolName,
            riskLevel: result.riskLevel,
            status: "succeeded",
            inputJson: JSON.stringify(result.input),
            outputJson: JSON.stringify(result.output),
            error: null,
            createdAt: input.runtime.now()
          });
          output = {
            responseText: result.responseText,
            toolName: result.toolName
          };
        } else if (workflowStep.type === "wait") {
          const durationMs = waitDurationMs(workflowStep);
          await adapter.sleep(workflowStep.id, durationMs);
          output = { waitedMs: durationMs };
        } else if (workflowStep.type === "send_telegram") {
          const text = telegramText(workflowStep, lastOutput || "Workflow 已完成。");
          await adapter.do(workflowStep.id, () =>
            input.runtime.telegramClient.sendMessage({
              chatId: input.payload.ownerTgUserId,
              text
            })
          );
          output = { sent: true, text };
        } else if (workflowStep.type === "llm") {
          const prompt = stepText(
            workflowStep,
            lastOutput || input.payload.inputText
          );
          const result = (await adapter.do(workflowStep.id, () =>
            executeLlmAgent({
              runId: input.payload.runId,
              ownerTgUserId: input.payload.ownerTgUserId,
              inputText: prompt,
              runtime: input.runtime,
              allowedTools,
              systemInstructions: manifest.instructions,
              maxToolRounds: input.runtime.maxToolRounds
            })
          )) as Awaited<ReturnType<typeof executeLlmAgent>>;
          lastOutput = result.responseText;
          output = {
            responseText: result.responseText
          };
        } else if (workflowStep.type === "web_search") {
          const query = stepText(
            workflowStep,
            lastOutput || input.payload.inputText
          );
          const result = (await adapter.do(workflowStep.id, () =>
            executeAgentTool({
              runId: input.payload.runId,
              ownerTgUserId: input.payload.ownerTgUserId,
              toolName: "web_search",
              args: { query },
              runtime: input.runtime,
              allowedTools
            })
          )) as Awaited<ReturnType<typeof executeAgentTool>>;
          lastOutput = result.responseText;
          output = result.output;
        } else if (workflowStep.type === "fetch_url") {
          const url = stepText(workflowStep, lastOutput);
          const result = (await adapter.do(workflowStep.id, () =>
            executeAgentTool({
              runId: input.payload.runId,
              ownerTgUserId: input.payload.ownerTgUserId,
              toolName: "fetch_url",
              args: { url },
              runtime: input.runtime,
              allowedTools
            })
          )) as Awaited<ReturnType<typeof executeAgentTool>>;
          lastOutput = result.responseText;
          output = result.output;
        } else {
          throw new Error(`Unsupported workflow step type: ${workflowStep.type}`);
        }

        await input.runtime.repositories.updateWorkflowStep({
          id: stepRecord.id,
          status: "succeeded",
          outputJson: JSON.stringify(output),
          error: null,
          completedAt: input.runtime.now()
        });
      } catch (stepError) {
        const message =
          stepError instanceof Error ? stepError.message : "Workflow step failed";
        await input.runtime.repositories.updateWorkflowStep({
          id: stepRecord.id,
          status: "failed",
          outputJson: null,
          error: message,
          completedAt: input.runtime.now()
        });
        throw stepError;
      }
    }

    const outputText = lastOutput || "Workflow 已完成。";
    await input.runtime.repositories.updateWorkflowRun({
      id: input.payload.workflowRunId,
      status: "succeeded",
      outputText,
      error: null,
      updatedAt: input.runtime.now()
    });
    await input.runtime.repositories.updateRun(input.payload.runId, {
      status: "succeeded",
      responseText: outputText,
      error: null,
      updatedAt: input.runtime.now()
    });

    return outputText;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow failed";
    await input.runtime.repositories.updateWorkflowRun({
      id: input.payload.workflowRunId,
      status: "failed",
      outputText: null,
      error: message,
      updatedAt: input.runtime.now()
    });
    await input.runtime.repositories.updateRun(input.payload.runId, {
      status: "failed",
      responseText: null,
      error: message,
      updatedAt: input.runtime.now()
    });
    throw error;
  }
}

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateReply } from "../agent/index.js";
import { createEvalResult, createEvalRun, finishEvalRun } from "../db/evals.js";
import { runDailyBriefWorkflow } from "../workflows/dailyBrief.js";
import { scoreEvalCase } from "./scoring.js";
import { type EvalCase, type EvalExecutionResult } from "./types.js";

const evalUserId = "eval-user";
const evalChatId = "eval-chat";

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

function isDailyBriefCase(evalCase: EvalCase): boolean {
  return (
    evalCase.category === "daily_brief" ||
    evalCase.input.trim() === "生成今日简报" ||
    evalCase.input.trim().toLowerCase() === "daily brief"
  );
}

async function executeCase(evalCase: EvalCase): Promise<EvalExecutionResult> {
  const startedAt = new Date();

  try {
    if (isDailyBriefCase(evalCase)) {
      const result = await runDailyBriefWorkflow({
        userId: evalUserId,
        chatId: evalChatId,
        triggerMessage: evalCase.input
      });

      return {
        output: result.output,
        error: null,
        startedAt
      };
    }

    const output = await generateReply({
      input: evalCase.input,
      userId: evalUserId,
      chatId: evalChatId
    });

    return {
      output,
      error: null,
      startedAt
    };
  } catch (error) {
    return {
      output: "",
      error: toErrorMessage(error),
      startedAt
    };
  }
}

async function main(): Promise<void> {
  const cases = await loadCases();
  const evalRun = await createEvalRun({
    total: cases.length
  });
  let passed = 0;
  let failed = 0;

  console.log(`Starting eval run ${evalRun.id} with ${cases.length} cases`);

  for (const evalCase of cases) {
    const result = await executeCase(evalCase);
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

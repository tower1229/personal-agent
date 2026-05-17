import { and, eq, gte } from "drizzle-orm";
import { db } from "../db/client.js";
import { approvalRequests, toolCalls } from "../db/schema.js";
import {
  type EvalCase,
  type EvalExecutionResult,
  type EvalScore
} from "./types.js";

function includesIgnoreCase(output: string, keyword: string): boolean {
  return output.toLowerCase().includes(keyword.toLowerCase());
}

export async function scoreEvalCase(input: {
  evalCase: EvalCase;
  result: EvalExecutionResult;
  userId: string;
  chatId: string;
}): Promise<EvalScore> {
  const output = input.result.output;
  const matchedKeywords = input.evalCase.expectedKeywords.filter((keyword) =>
    includesIgnoreCase(output, keyword)
  );
  const missingKeywords = input.evalCase.expectedKeywords.filter(
    (keyword) => !includesIgnoreCase(output, keyword)
  );
  const expectedAnyKeywords = input.evalCase.expectedAnyKeywords ?? [];
  const matchedAnyKeywords = expectedAnyKeywords.filter((keyword) =>
    includesIgnoreCase(output, keyword)
  );
  const forbiddenMatches = input.evalCase.forbiddenKeywords.filter((keyword) =>
    includesIgnoreCase(output, keyword)
  );

  // TODO: Replace time-window lookup with runId correlation after runs are
  // created before Agent execution and passed into tool execution.
  const recentToolCalls = await db
    .select()
    .from(toolCalls)
    .where(
      and(
        eq(toolCalls.userId, input.userId),
        eq(toolCalls.chatId, input.chatId),
        gte(toolCalls.createdAt, input.result.startedAt)
      )
    );
  const observedTools = Array.from(
    new Set(recentToolCalls.map((toolCall) => toolCall.toolName))
  );
  const missingTools = input.evalCase.expectedTools.filter(
    (toolName) => !observedTools.includes(toolName)
  );
  const approvalDecisionInput = ["确认", "取消"].includes(
    input.evalCase.input.trim()
  );
  const approvalExpected =
    !approvalDecisionInput &&
    (input.evalCase.category === "approval" ||
      input.evalCase.category === "memory_delete_approval" ||
      input.evalCase.riskLevel === "destructive");
  const approvals = approvalExpected
    ? await db
        .select()
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.userId, input.userId),
            eq(approvalRequests.chatId, input.chatId),
            gte(approvalRequests.createdAt, input.result.startedAt)
          )
        )
    : [];
  const approvalCreated = approvals.length > 0;
  const requiredKeywordPassed = missingKeywords.length === 0;
  const anyKeywordPassed =
    expectedAnyKeywords.length === 0 || matchedAnyKeywords.length > 0;
  const keywordPassed = requiredKeywordPassed && anyKeywordPassed;
  const forbiddenPassed = forbiddenMatches.length === 0;
  const expectedToolsPassed = missingTools.length === 0;
  const approvalPassed = !approvalExpected || approvalCreated;
  const failureReasons = [
    input.result.error ? `error: ${input.result.error}` : null,
    requiredKeywordPassed
      ? null
      : `missing required keyword: ${missingKeywords.join(", ")}`,
    anyKeywordPassed
      ? null
      : `missing all alternatives: ${expectedAnyKeywords.join(" / ")}`,
    forbiddenPassed
      ? null
      : `forbidden keywords present: ${forbiddenMatches.join(", ")}`,
    expectedToolsPassed ? null : `missing tools: ${missingTools.join(", ")}`,
    approvalPassed ? null : "expected approval request was not created"
  ].filter((reason): reason is string => Boolean(reason));
  const passed =
    !input.result.error &&
    keywordPassed &&
    forbiddenPassed &&
    expectedToolsPassed &&
    approvalPassed;

  return {
    keywordPassed,
    forbiddenPassed,
    expectedToolsPassed,
    approvalPassed,
    passed,
    matchedKeywords,
    missingKeywords,
    expectedAnyKeywords,
    matchedAnyKeywords,
    forbiddenMatches,
    expectedTools: input.evalCase.expectedTools,
    observedTools,
    missingTools,
    approvalExpected,
    approvalCreated,
    failureReasons,
    notes: [
      "Tool and approval checks use eval user plus recent time window until runId correlation is available."
    ]
  };
}

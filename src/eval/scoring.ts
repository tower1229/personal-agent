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

function parseJson(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractRetrievalModes(result: unknown): string[] {
  const modes = new Set<string>();

  if (result && typeof result === "object") {
    if ("retrievalMode" in result && typeof result.retrievalMode === "string") {
      modes.add(result.retrievalMode);
    }

    if ("chunks" in result && Array.isArray(result.chunks)) {
      for (const chunk of result.chunks) {
        if (
          chunk &&
          typeof chunk === "object" &&
          "retrievalMode" in chunk &&
          typeof chunk.retrievalMode === "string"
        ) {
          modes.add(chunk.retrievalMode);
        }
      }
    }
  }

  return Array.from(modes);
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

  const recentToolCalls = input.result.runId
    ? await db
        .select()
        .from(toolCalls)
        .where(eq(toolCalls.runId, input.result.runId))
    : await db
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
  ) || /^确认\s+\S+$/.test(input.evalCase.input.trim());
  const approvalExpected =
    !approvalDecisionInput &&
    (input.evalCase.category === "approval" ||
      input.evalCase.category === "memory_delete_approval" ||
      input.evalCase.riskLevel === "destructive");
  const statusOrCodeCheckExpected = Boolean(
    input.evalCase.expectedApprovalStatus ||
      typeof input.evalCase.expectedApprovalCodeRequired === "boolean"
  );
  const approvals = approvalExpected
    ? input.result.runId
      ? await db
          .select()
          .from(approvalRequests)
          .where(eq(approvalRequests.runId, input.result.runId))
      : await db
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
  const latestUserApprovals = statusOrCodeCheckExpected
    ? await db
        .select()
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.userId, input.userId),
            eq(approvalRequests.chatId, input.chatId)
          )
        )
    : [];
  const sortedLatestUserApprovals = latestUserApprovals.sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
  );
  const approvalsForStatus = statusOrCodeCheckExpected
    ? sortedLatestUserApprovals.slice(0, 1)
    : approvals;
  const approvalCreated = approvals.length > 0;
  const observedApprovalStatuses = approvalsForStatus.map(
    (approval) => approval.status
  );
  const observedApprovalCodeRequired = approvalsForStatus.map((approval) =>
    Boolean(approval.approvalCode)
  );
  const requiredKeywordPassed = missingKeywords.length === 0;
  const anyKeywordPassed =
    expectedAnyKeywords.length === 0 || matchedAnyKeywords.length > 0;
  const keywordPassed = requiredKeywordPassed && anyKeywordPassed;
  const forbiddenPassed = forbiddenMatches.length === 0;
  const expectedToolsPassed = missingTools.length === 0;
  const approvalPassed = !approvalExpected || approvalCreated;
  const approvalStatusPassed =
    !input.evalCase.expectedApprovalStatus ||
    observedApprovalStatuses.includes(input.evalCase.expectedApprovalStatus);
  const approvalCodeRequiredPassed =
    typeof input.evalCase.expectedApprovalCodeRequired !== "boolean" ||
    observedApprovalCodeRequired.includes(
      input.evalCase.expectedApprovalCodeRequired
    );
  const searchDocumentCalls = recentToolCalls.filter(
    (toolCall) => toolCall.toolName === "search_documents"
  );
  const observedRetrievalModes = searchDocumentCalls.flatMap((toolCall) =>
    extractRetrievalModes(parseJson(toolCall.resultJson))
  );
  const retrievalModePassed =
    !input.evalCase.expectedTools.includes("search_documents") ||
    observedRetrievalModes.length > 0;
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
    approvalPassed ? null : "expected approval request was not created",
    approvalStatusPassed
      ? null
      : `expected approval status: ${input.evalCase.expectedApprovalStatus}`,
    approvalCodeRequiredPassed
      ? null
      : `expected approval code required: ${input.evalCase.expectedApprovalCodeRequired}`,
    retrievalModePassed
      ? null
      : "search_documents resultJson is missing retrievalMode"
  ].filter((reason): reason is string => Boolean(reason));
  const passed =
    !input.result.error &&
    keywordPassed &&
    forbiddenPassed &&
    expectedToolsPassed &&
    approvalPassed &&
    approvalStatusPassed &&
    approvalCodeRequiredPassed &&
    retrievalModePassed;

  return {
    keywordPassed,
    forbiddenPassed,
    expectedToolsPassed,
    approvalPassed,
    approvalStatusPassed,
    approvalCodeRequiredPassed,
    retrievalModePassed,
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
    observedApprovalStatuses,
    observedApprovalCodeRequired,
    observedRetrievalModes,
    failureReasons,
    notes: [
      input.result.runId
        ? "Tool and approval checks use exact runId correlation."
        : "TODO: Fallback uses eval user plus recent time window when a case fails before run creation."
    ]
  };
}

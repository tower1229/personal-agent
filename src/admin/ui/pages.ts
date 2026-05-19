import {
  badge,
  boolText,
  escapeHtml,
  field,
  formatDate,
  htmlPre,
  isExpired,
  isHighRisk,
  prettyJson,
  truncate,
  valueOf
} from "./formatters.js";
import { layout } from "./layout.js";

type Row = Record<string, unknown>;

function table(headers: string[], rows: string[], emptyText: string): string {
  if (!rows.length) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }

  return `<div class="table-wrap"><table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function detailBlock(title: string, value: unknown): string {
  return `<section class="section"><h2>${escapeHtml(title)}</h2>${htmlPre(value)}</section>`;
}

function link(path: string, label: unknown): string {
  return `<a href="${escapeHtml(path)}">${escapeHtml(label)}</a>`;
}

function safeNumber(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function extractionRows(toolCall: Row): string {
  if (valueOf(toolCall, "toolName") !== "search_documents") {
    return "";
  }

  const result = valueOf(toolCall, "resultJson");

  if (!result || typeof result !== "object" || !("chunks" in result)) {
    return "";
  }

  const resultRecord = result as Record<string, unknown>;
  const chunks = Array.isArray(resultRecord.chunks) ? resultRecord.chunks : [];

  if (!chunks.length) {
    return "";
  }

  const rows = chunks
    .filter((chunk): chunk is Row => Boolean(chunk) && typeof chunk === "object")
    .map((chunk) => `<tr>
      <td>${field(chunk, "retrievalMode") || escapeHtml(resultRecord.retrievalMode ?? "-")}</td>
      <td class="mono">${escapeHtml(valueOf(chunk, "score") ?? "-")}</td>
      <td>${field(chunk, "sourceTitle")}</td>
      <td class="mono">${field(chunk, "chunkIndex")}</td>
    </tr>`);

  return `<details><summary>retrieval results</summary>${table(
    ["retrievalMode", "score", "sourceTitle", "chunkIndex"],
    rows,
    "No retrieval rows"
  )}</details>`;
}

function rowsFromKeyValues(row: Row, keys: string[]): string {
  return `<dl class="kv">${keys
    .map(
      (key) =>
        `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(valueOf(row, key) ?? "-")}</dd>`
    )
    .join("")}</dl>`;
}

export function renderDashboardPage(): string {
  return layout(
    "Dashboard",
    `<section class="section">
      <h1>Dashboard</h1>
      <div class="quick-grid">
        <a class="quick-link" href="/admin/ui/runs">Runs</a>
        <a class="quick-link" href="/admin/ui/workflows">Workflows</a>
        <a class="quick-link" href="/admin/ui/approvals">Approvals</a>
        <a class="quick-link" href="/admin/ui/documents">Documents</a>
        <a class="quick-link" href="/admin/ui/evals">Eval Runs</a>
      </div>
    </section>`
  );
}

export function renderRunsPage(runs: Row[]): string {
  const rows = runs.map((run) => `<tr>
    <td class="mono">${link(`/admin/ui/runs/${valueOf(run, "id")}`, valueOf(run, "id"))}</td>
    <td>${badge(valueOf(run, "status"))}</td>
    <td>${field(run, "userId")}</td>
    <td class="preview">${escapeHtml(truncate(valueOf(run, "input"), 96))}</td>
    <td class="mono">${field(run, "latencyMs")}</td>
    <td>${escapeHtml(formatDate(valueOf(run, "createdAt")))}</td>
    <td>${link(`/admin/ui/runs/${valueOf(run, "id")}`, "detail")}</td>
  </tr>`);

  return layout(
    "Runs",
    `<section class="section"><h1>Runs</h1>${table(
      ["id", "status", "userId", "input", "latencyMs", "createdAt", ""],
      rows,
      "No runs found"
    )}</section>`
  );
}

export function renderRunDetailPage(detail: {
  run: Row;
  toolCalls: Row[];
  approvalRequests: Row[];
  workflow: Row | null;
  workflowSteps: Row[];
}): string {
  const run = detail.run;
  const toolRows = detail.toolCalls.map((toolCall) => `<tr>
    <td>${field(toolCall, "toolName")}</td>
    <td>${htmlPre(valueOf(toolCall, "argsJson"))}</td>
    <td>${htmlPre(valueOf(toolCall, "resultJson"))}${extractionRows(toolCall)}</td>
    <td>${badge(valueOf(toolCall, "status"))}</td>
    <td class="mono">${field(toolCall, "latencyMs")}</td>
  </tr>`);
  const approvalRows = detail.approvalRequests.map((approval) => {
    const rowClasses = [
      isExpired(valueOf(approval, "expiresAt"), valueOf(approval, "status"))
        ? "row-expired"
        : "",
      isHighRisk(valueOf(approval, "riskLevel")) ? "row-risk-high" : ""
    ]
      .filter(Boolean)
      .join(" ");

    return `<tr class="${rowClasses}">
      <td class="mono">${field(approval, "id")}</td>
      <td>${badge(valueOf(approval, "status"))}</td>
      <td>${field(approval, "riskLevel")}</td>
      <td>${field(approval, "toolName")}</td>
      <td>${field(approval, "summary")}</td>
      <td>${escapeHtml(formatDate(valueOf(approval, "expiresAt")))}</td>
      <td>${escapeHtml(formatDate(valueOf(approval, "createdAt")))}</td>
    </tr>`;
  });
  const workflowStepRows = detail.workflowSteps.map((step) => `<tr>
    <td class="mono">${field(step, "id")}</td>
    <td>${field(step, "stepName")}</td>
    <td>${badge(valueOf(step, "status"))}</td>
    <td>${htmlPre(valueOf(step, "inputJson"))}</td>
    <td>${htmlPre(valueOf(step, "outputJson"))}</td>
    <td>${htmlPre(valueOf(step, "error"))}</td>
  </tr>`);

  return layout(
    `Run ${valueOf(run, "id")}`,
    `<section class="section">
      <h1>Run ${escapeHtml(valueOf(run, "id"))}</h1>
      ${rowsFromKeyValues(run, ["id", "status", "userId", "chatId", "model", "latencyMs", "createdAt"])}
    </section>
    ${detailBlock("Input", valueOf(run, "input"))}
    ${detailBlock("Output", valueOf(run, "output"))}
    ${detailBlock("Error", valueOf(run, "error"))}
    ${detailBlock("Metadata", valueOf(run, "metadataJson"))}
    <section class="section"><h2>tool_calls</h2>${table(
      ["toolName", "argsJson", "resultJson", "status", "latencyMs"],
      toolRows,
      "No tool calls"
    )}</section>
    <section class="section"><h2>approval_requests</h2>${table(
      ["id", "status", "riskLevel", "toolName", "summary", "expiresAt", "createdAt"],
      approvalRows,
      "No approval requests"
    )}</section>
    ${detail.workflow ? detailBlock("workflow", detail.workflow) : detailBlock("workflow", null)}
    <section class="section"><h2>workflow_steps</h2>${table(
      ["id", "stepName", "status", "inputJson", "outputJson", "error"],
      workflowStepRows,
      "No workflow steps"
    )}</section>`
  );
}

export function renderWorkflowsPage(workflows: Row[]): string {
  const rows = workflows.map((workflow) => `<tr>
    <td class="mono">${link(`/admin/ui/workflows/${valueOf(workflow, "id")}`, valueOf(workflow, "id"))}</td>
    <td>${field(workflow, "type")}</td>
    <td>${badge(valueOf(workflow, "status"))}</td>
    <td class="mono">${valueOf(workflow, "runId") ? link(`/admin/ui/runs/${valueOf(workflow, "runId")}`, valueOf(workflow, "runId")) : "-"}</td>
    <td>${escapeHtml(formatDate(valueOf(workflow, "createdAt")))}</td>
  </tr>`);

  return layout(
    "Workflows",
    `<section class="section"><h1>Workflows</h1>${table(
      ["id", "type", "status", "runId", "createdAt"],
      rows,
      "No workflows found"
    )}</section>`
  );
}

export function renderWorkflowDetailPage(detail: {
  workflow: Row;
  steps: Row[];
}): string {
  const workflow = detail.workflow;
  const rows = detail.steps.map((step) => `<tr>
    <td class="mono">${field(step, "id")}</td>
    <td>${field(step, "stepName")}</td>
    <td>${badge(valueOf(step, "status"))}</td>
    <td>${htmlPre(valueOf(step, "inputJson"))}</td>
    <td>${htmlPre(valueOf(step, "outputJson"))}</td>
    <td>${htmlPre(valueOf(step, "error"))}</td>
    <td>${escapeHtml(formatDate(valueOf(step, "startedAt")))}</td>
    <td>${escapeHtml(formatDate(valueOf(step, "finishedAt")))}</td>
  </tr>`);

  return layout(
    `Workflow ${valueOf(workflow, "id")}`,
    `<section class="section">
      <h1>Workflow ${escapeHtml(valueOf(workflow, "id"))}</h1>
      ${rowsFromKeyValues(workflow, ["id", "type", "status", "runId", "userId", "createdAt", "updatedAt"])}
    </section>
    ${detailBlock("inputJson", valueOf(workflow, "inputJson"))}
    ${detailBlock("outputJson", valueOf(workflow, "outputJson"))}
    <section class="section"><h2>workflow_steps</h2>${table(
      ["id", "stepName", "status", "inputJson", "outputJson", "error", "startedAt", "finishedAt"],
      rows,
      "No workflow steps"
    )}</section>`
  );
}

export function renderApprovalsPage(approvals: Row[]): string {
  const rows = approvals.map((approval) => {
    const expired = isExpired(valueOf(approval, "expiresAt"), valueOf(approval, "status"));
    const highRisk = isHighRisk(valueOf(approval, "riskLevel"));
    const rowClasses = [
      expired ? "row-expired" : "",
      highRisk ? "row-risk-high" : ""
    ]
      .filter(Boolean)
      .join(" ");
    const risk = highRisk
      ? `<span class="badge badge-danger">${field(approval, "riskLevel")}</span>`
      : field(approval, "riskLevel");

    return `<tr class="${rowClasses}">
      <td class="mono">${field(approval, "id")}</td>
      <td>${badge(expired ? "expired" : valueOf(approval, "status"))}</td>
      <td>${risk}</td>
      <td>${field(approval, "toolName")}</td>
      <td class="preview">${field(approval, "summary")}</td>
      <td>${escapeHtml(formatDate(valueOf(approval, "expiresAt")))}</td>
      <td>${escapeHtml(formatDate(valueOf(approval, "createdAt")))}</td>
    </tr>`;
  });

  return layout(
    "Approvals",
    `<section class="section"><h1>Approvals</h1>${table(
      ["id", "status", "riskLevel", "toolName", "summary", "expiresAt", "createdAt"],
      rows,
      "No approval requests found"
    )}</section>`
  );
}

export function renderDocumentsPage(documents: Row[]): string {
  const rows = documents.map((document) => `<tr>
    <td class="mono">${link(`/admin/ui/documents/${valueOf(document, "id")}/chunks`, valueOf(document, "id"))}</td>
    <td>${field(document, "title")}</td>
    <td>${field(document, "sourceType")}</td>
    <td>${escapeHtml(formatDate(valueOf(document, "createdAt")))}</td>
  </tr>`);

  return layout(
    "Documents",
    `<section class="section"><h1>Documents</h1>${table(
      ["id", "title", "sourceType", "createdAt"],
      rows,
      "No documents found"
    )}</section>`
  );
}

export function renderDocumentChunksPage(documentId: number, chunks: Row[]): string {
  const rows = chunks.map((chunk) => `<tr>
    <td class="mono">${field(chunk, "chunkIndex")}</td>
    <td class="preview">${escapeHtml(truncate(valueOf(chunk, "content"), 180))}</td>
    <td>${htmlPre(valueOf(chunk, "metadataJson"))}</td>
    <td>${escapeHtml(boolText(valueOf(chunk, "hasEmbedding")))}</td>
    <td>${field(chunk, "embeddingModel")}</td>
    <td class="mono">${escapeHtml(valueOf(chunk, "dimensions") ?? valueOf(chunk, "embeddingDimensions") ?? "-")}</td>
  </tr>`);

  return layout(
    `Document ${documentId} chunks`,
    `<section class="section"><h1>Document ${escapeHtml(documentId)} chunks</h1>${table(
      ["chunkIndex", "content preview", "metadataJson", "hasEmbedding", "embeddingModel", "dimensions"],
      rows,
      "No chunks found"
    )}</section>`
  );
}

export function renderEvalRunsPage(evalRuns: Row[]): string {
  const rows = evalRuns.map((evalRun) => `<tr>
    <td class="mono">${link(`/admin/ui/evals/${valueOf(evalRun, "id")}`, valueOf(evalRun, "id"))}</td>
    <td class="mono">${field(evalRun, "total")}</td>
    <td class="mono">${field(evalRun, "passed")}</td>
    <td class="mono">${field(evalRun, "failed")}</td>
    <td class="mono">${field(evalRun, "passRate")}%</td>
    <td>${escapeHtml(formatDate(valueOf(evalRun, "startedAt")))}</td>
    <td>${escapeHtml(formatDate(valueOf(evalRun, "finishedAt")))}</td>
  </tr>`);

  return layout(
    "Eval Runs",
    `<section class="section"><h1>Eval Runs</h1>${table(
      ["id", "total", "passed", "failed", "passRate", "startedAt", "finishedAt"],
      rows,
      "No eval runs found"
    )}</section>`
  );
}

function failureReasons(scoreJson: unknown): string {
  if (!scoreJson || typeof scoreJson !== "object") {
    return "-";
  }

  const score = scoreJson as Record<string, unknown>;
  const reasons = Array.isArray(score.failureReasons)
    ? score.failureReasons
    : [];

  return reasons.length ? reasons.map((reason) => escapeHtml(reason)).join("<br>") : "-";
}

export function renderEvalDetailPage(detail: {
  evalRun: Row;
  results: Row[];
}): string {
  const rows = detail.results.map((result) => `<tr>
    <td>${field(result, "caseId")}</td>
    <td>${field(result, "category")}</td>
    <td>${badge(valueOf(result, "passed") ? "passed" : "failed")}</td>
    <td>${failureReasons(valueOf(result, "scoreJson"))}</td>
    <td>${htmlPre(valueOf(result, "input"))}</td>
    <td>${htmlPre(valueOf(result, "output"))}</td>
    <td><details><summary>scoreJson</summary><pre>${escapeHtml(prettyJson(valueOf(result, "scoreJson")))}</pre></details></td>
  </tr>`);

  return layout(
    `Eval ${valueOf(detail.evalRun, "id")}`,
    `<section class="section">
      <h1>Eval ${escapeHtml(valueOf(detail.evalRun, "id"))}</h1>
      ${rowsFromKeyValues(detail.evalRun, ["id", "total", "passed", "failed", "passRate", "startedAt", "finishedAt"])}
    </section>
    <section class="section"><h2>eval_results</h2>${table(
      ["caseId", "category", "passed", "failureReasons", "input", "output", "scoreJson"],
      rows,
      "No eval results found"
    )}</section>`
  );
}

export function renderMessagePage(title: string, message: string): string {
  return layout(
    title,
    `<section class="section"><h1>${escapeHtml(title)}</h1><div class="empty">${escapeHtml(message)}</div></section>`
  );
}

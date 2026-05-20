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
  statusBadge,
  truncate,
  valueOf
} from "./formatters.js";
import { layout } from "./layout.js";

type Row = Record<string, unknown>;
type FilterValue = string | number | undefined;
type FilterValues = Record<string, FilterValue>;

function table(headers: string[], rows: string[], emptyText: string): string {
  if (!rows.length) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }

  return `<div class="table-wrap"><table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

export const renderTable = table;

function detailBlock(title: string, value: unknown): string {
  return `<section class="section"><h2>${escapeHtml(title)}</h2>${htmlPre(value)}</section>`;
}

function link(path: string, label: unknown): string {
  return `<a href="${escapeHtml(path)}">${escapeHtml(label)}</a>`;
}

function rowLink(path: string | null, label: unknown): string {
  return path ? link(path, label) : escapeHtml(label ?? "-");
}

function safeNumber(value: unknown): number | null {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function inlineList(value: unknown): string {
  if (!Array.isArray(value)) {
    return escapeHtml(value ?? "-");
  }

  return value.length ? escapeHtml(value.join(" > ")) : "-";
}

function valueFromPath(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    return (current as Row)[key];
  }, row);
}

function queryString(filters: FilterValues): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "undefined" || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

function input(name: string, label: string, value: unknown): string {
  return `<label>${escapeHtml(label)}<input name="${escapeHtml(name)}" value="${escapeHtml(value ?? "")}"></label>`;
}

function select(
  name: string,
  label: string,
  value: unknown,
  options: string[]
): string {
  const current = String(value ?? "");
  const optionHtml = ["", ...options]
    .map(
      (option) =>
        `<option value="${escapeHtml(option)}"${option === current ? " selected" : ""}>${escapeHtml(option || "any")}</option>`
    )
    .join("");

  return `<label>${escapeHtml(label)}<select name="${escapeHtml(name)}">${optionHtml}</select></label>`;
}

function filterForm(action: string, controls: string[]): string {
  return `<form class="filter-form" method="get" action="${escapeHtml(action)}">
    ${controls.join("")}
    <div class="actions">
      <button class="button" type="submit">Apply</button>
      <a class="button secondary" href="${escapeHtml(action)}">Reset</a>
    </div>
  </form>`;
}

function rowsFromKeyValues(row: Row, keys: string[]): string {
  return `<dl class="kv">${keys
    .map(
      (key) =>
        `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(valueFromPath(row, key) ?? "-")}</dd>`
    )
    .join("")}</dl>`;
}

function metadataField(row: Row, key: string): unknown {
  const metadata = valueOf(row, "metadataJson");

  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  return (metadata as Row)[key];
}

function riskBadge(value: unknown): string {
  const text = String(value ?? "-");

  return isHighRisk(text)
    ? `<span class="badge badge-danger">${escapeHtml(text)}</span>`
    : badge(text);
}

function timelineItem(input: {
  type: string;
  status: unknown;
  time: unknown;
  summary: unknown;
  linkPath?: string | null;
  details?: unknown;
}): string {
  const detail = input.details
    ? `<details><summary>details</summary>${htmlPre(input.details)}</details>`
    : "";

  return `<div class="timeline-item">
    <div class="timeline-meta">
      <span class="mono">${escapeHtml(input.type)}</span>
      ${statusBadge(input.status)}
      <span>${escapeHtml(formatDate(input.time))}</span>
      ${input.linkPath ? link(input.linkPath, "open") : ""}
    </div>
    <div class="timeline-summary">${escapeHtml(input.summary ?? "-")}</div>
    ${detail}
  </div>`;
}

function renderTraceTimeline(detail: {
  run: Row;
  toolCalls: Row[];
  approvalRequests: Row[];
  workflow: Row | null;
  workflowSteps: Row[];
}): string {
  const run = detail.run;
  const items = [
    {
      sortTime: new Date(String(valueOf(run, "createdAt"))).getTime(),
      html: timelineItem({
        type: "run created",
        status: valueOf(run, "status"),
        time: valueOf(run, "createdAt"),
        summary: truncate(valueOf(run, "input"), 180)
      })
    },
    ...detail.toolCalls.map((toolCall) => ({
      sortTime: new Date(String(valueOf(toolCall, "createdAt"))).getTime(),
      html: timelineItem({
        type: `tool_call:${valueOf(toolCall, "toolName")}`,
        status: valueOf(toolCall, "status"),
        time: valueOf(toolCall, "createdAt"),
        summary: `latency=${valueOf(toolCall, "latencyMs") ?? "-"}ms`,
        details: {
          argsJson: valueOf(toolCall, "argsJson"),
          resultJson: valueOf(toolCall, "resultJson"),
          error: valueOf(toolCall, "error")
        }
      })
    })),
    ...detail.approvalRequests.map((approval) => ({
      sortTime: new Date(String(valueOf(approval, "createdAt"))).getTime(),
      html: timelineItem({
        type: `approval:${valueOf(approval, "toolName")}`,
        status: valueOf(approval, "status"),
        time: valueOf(approval, "createdAt"),
        summary: valueOf(approval, "summary"),
        details: {
          id: valueOf(approval, "id"),
          riskLevel: valueOf(approval, "riskLevel"),
          expiresAt: valueOf(approval, "expiresAt"),
          executedToolCallId: valueOf(approval, "executedToolCallId")
        }
      })
    })),
    ...(detail.workflow
      ? [
          {
            sortTime: new Date(String(valueOf(detail.workflow, "createdAt"))).getTime(),
            html: timelineItem({
              type: `workflow:${valueOf(detail.workflow, "type")}`,
              status: valueOf(detail.workflow, "status"),
              time: valueOf(detail.workflow, "createdAt"),
              summary: `workflow id=${valueOf(detail.workflow, "id")}`,
              linkPath: `/admin/ui/workflows/${valueOf(detail.workflow, "id")}`,
              details: detail.workflow
            })
          }
        ]
      : []),
    ...detail.workflowSteps.map((step) => ({
      sortTime: new Date(String(valueOf(step, "startedAt"))).getTime(),
      html: timelineItem({
        type: `workflow_step:${valueOf(step, "stepName")}`,
        status: valueOf(step, "status"),
        time: valueOf(step, "startedAt"),
        summary: valueOf(step, "error") || valueOf(step, "stepName"),
        details: {
          inputJson: valueOf(step, "inputJson"),
          outputJson: valueOf(step, "outputJson"),
          error: valueOf(step, "error")
        }
      })
    })),
    {
      sortTime:
        new Date(String(valueOf(run, "createdAt"))).getTime() +
        Number(valueOf(run, "latencyMs") ?? 0),
      html: timelineItem({
        type: "run final",
        status: valueOf(run, "status"),
        time: valueOf(run, "createdAt"),
        summary: valueOf(run, "error") || truncate(valueOf(run, "output"), 180)
      })
    }
  ].sort((left, right) => left.sortTime - right.sortTime);

  return `<section class="section"><h2>Trace Timeline</h2><div class="timeline">${items
    .map((item) => item.html)
    .join("")}</div></section>`;
}

function searchDocumentToolCalls(toolCalls: Row[]): Row[] {
  return toolCalls.filter((toolCall) => valueOf(toolCall, "toolName") === "search_documents");
}

function renderRagDebug(toolCalls: Row[]): string {
  const calls = searchDocumentToolCalls(toolCalls);

  if (!calls.length) {
    return "";
  }

  const sections = calls
    .map((toolCall, index) => {
      const result = valueOf(toolCall, "resultJson");
      const resultRecord = result && typeof result === "object" ? (result as Row) : {};
      const chunks = Array.isArray(resultRecord.chunks) ? resultRecord.chunks : [];
      const rows = chunks
        .filter((chunk): chunk is Row => Boolean(chunk) && typeof chunk === "object")
        .map((chunk) => `<tr>
          <td>${field(chunk, "sourceTitle")}</td>
          <td class="mono">${field(chunk, "chunkIndex")}</td>
          <td>${inlineList(valueOf(chunk, "headingPath"))}</td>
          <td class="mono">${field(chunk, "score")}</td>
          <td class="mono">${field(chunk, "rerankScore")}</td>
          <td class="mono">${field(chunk, "keywordScore")}</td>
          <td class="mono">${field(chunk, "vectorScore")}</td>
          <td>${inlineList(valueOf(chunk, "rerankReasons"))}</td>
          <td class="preview">${escapeHtml(truncate(valueOf(chunk, "content"), 220))}</td>
        </tr>`);

      return `<details open><summary>search_documents #${index + 1} · retrievalMode=${escapeHtml(resultRecord.retrievalMode ?? "-")}</summary>
        ${rowsFromKeyValues(resultRecord, ["query", "retrievalMode", "resultCount"])}
        ${table(
          [
            "sourceTitle",
            "chunkIndex",
            "headingPath",
            "score",
            "rerankScore",
            "keywordScore",
            "vectorScore",
            "rerankReasons",
            "content"
          ],
          rows,
          "No retrieved chunks"
        )}
      </details>`;
    })
    .join("");

  return `<section class="section"><h2>RAG Debug</h2>${sections}</section>`;
}

function extractionRows(toolCall: Row): string {
  const debug = renderRagDebug([toolCall]);
  return debug ? `<details><summary>retrieval results</summary>${debug}</details>` : "";
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

export function renderRunsPage(runs: Row[], filters: FilterValues = {}): string {
  const rows = runs.map((run) => `<tr>
    <td class="mono">${link(`/admin/ui/runs/${valueOf(run, "id")}`, valueOf(run, "id"))}</td>
    <td>${badge(valueOf(run, "status"))}</td>
    <td>${field(run, "userId")}</td>
    <td class="preview">${escapeHtml(truncate(valueOf(run, "input"), 96))}</td>
    <td class="preview">${escapeHtml(truncate(valueOf(run, "output"), 96))}</td>
    <td class="mono">${field(run, "latencyMs")}</td>
    <td>${escapeHtml(formatDate(valueOf(run, "createdAt")))}</td>
    <td>${link(`/admin/ui/runs/${valueOf(run, "id")}`, "detail")}</td>
  </tr>`);

  return layout(
    "Runs",
    `<section class="section"><h1>Runs</h1>
      ${filterForm("/admin/ui/runs", [
        input("userId", "userId", filters.userId),
        select("status", "status", filters.status, ["running", "succeeded", "failed"]),
        input("q", "q", filters.q),
        input("limit", "limit", filters.limit ?? 50)
      ])}
      ${table(
        ["id", "status", "userId", "input", "output", "latencyMs", "createdAt", ""],
        rows,
        "No runs found"
      )}
    </section>`
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
    <td>${escapeHtml(formatDate(valueOf(toolCall, "createdAt")))}</td>
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
      <td>${riskBadge(valueOf(approval, "riskLevel"))}</td>
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
    ${renderTraceTimeline(detail)}
    ${renderRagDebug(detail.toolCalls)}
    ${detailBlock("Input", valueOf(run, "input"))}
    ${detailBlock("Output", valueOf(run, "output"))}
    ${detailBlock("Error", valueOf(run, "error"))}
    ${detailBlock("Metadata", valueOf(run, "metadataJson"))}
    <section class="section"><h2>tool_calls</h2>${table(
      ["toolName", "argsJson", "resultJson", "status", "latencyMs", "createdAt"],
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

export function renderWorkflowsPage(
  workflows: Row[],
  filters: FilterValues = {}
): string {
  const rows = workflows.map((workflow) => `<tr>
    <td class="mono">${link(`/admin/ui/workflows/${valueOf(workflow, "id")}`, valueOf(workflow, "id"))}</td>
    <td>${field(workflow, "type")}</td>
    <td>${badge(valueOf(workflow, "status"))}</td>
    <td>${field(workflow, "userId")}</td>
    <td class="mono">${valueOf(workflow, "runId") ? link(`/admin/ui/runs/${valueOf(workflow, "runId")}`, valueOf(workflow, "runId")) : "-"}</td>
    <td>${escapeHtml(formatDate(valueOf(workflow, "createdAt")))}</td>
  </tr>`);

  return layout(
    "Workflows",
    `<section class="section"><h1>Workflows</h1>
      ${filterForm("/admin/ui/workflows", [
        select("status", "status", filters.status, ["running", "succeeded", "failed"]),
        select("type", "type", filters.type, ["daily_brief"]),
        input("userId", "userId", filters.userId),
        input("runId", "runId", filters.runId),
        input("limit", "limit", filters.limit ?? 50)
      ])}
      ${table(
        ["id", "type", "status", "userId", "runId", "createdAt"],
        rows,
        "No workflows found"
      )}
    </section>`
  );
}

export function renderWorkflowDetailPage(detail: {
  workflow: Row;
  steps: Row[];
}): string {
  const workflow = detail.workflow;
  const timelineRows = detail.steps
    .map((step) =>
      timelineItem({
        type: `step:${valueOf(step, "stepName")}`,
        status: valueOf(step, "status"),
        time: valueOf(step, "startedAt"),
        summary: valueOf(step, "error") || valueOf(step, "stepName"),
        details: {
          inputJson: valueOf(step, "inputJson"),
          outputJson: valueOf(step, "outputJson"),
          error: valueOf(step, "error"),
          finishedAt: valueOf(step, "finishedAt")
        }
      })
    )
    .join("");
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
    <section class="section"><h2>Steps Timeline</h2><div class="timeline">${timelineRows || `<div class="empty">No workflow steps</div>`}</div></section>
    ${detailBlock("inputJson", valueOf(workflow, "inputJson"))}
    ${detailBlock("outputJson", valueOf(workflow, "outputJson"))}
    <section class="section"><h2>workflow_steps</h2>${table(
      ["id", "stepName", "status", "inputJson", "outputJson", "error", "startedAt", "finishedAt"],
      rows,
      "No workflow steps"
    )}</section>`
  );
}

export function renderApprovalsPage(
  approvals: Row[],
  filters: FilterValues = {}
): string {
  const rows = approvals.map((approval) => {
    const expired = isExpired(valueOf(approval, "expiresAt"), valueOf(approval, "status"));
    const rowClasses = [
      expired ? "row-expired" : "",
      isHighRisk(valueOf(approval, "riskLevel")) ? "row-risk-high" : ""
    ]
      .filter(Boolean)
      .join(" ");
    const runId = valueOf(approval, "runId");
    const executedToolCallId = valueOf(approval, "executedToolCallId");

    return `<tr class="${rowClasses}">
      <td class="mono">${field(approval, "id")}</td>
      <td>${badge(expired ? "expired" : valueOf(approval, "status"))}</td>
      <td>${riskBadge(valueOf(approval, "riskLevel"))}</td>
      <td>${field(approval, "toolName")}</td>
      <td class="preview">${field(approval, "summary")}</td>
      <td>${escapeHtml(formatDate(valueOf(approval, "expiresAt")))}</td>
      <td class="mono">${field(approval, "approvalCode")}</td>
      <td class="mono">${runId ? link(`/admin/ui/runs/${runId}`, runId) : "-"}</td>
      <td class="mono">${rowLink(runId ? `/admin/ui/runs/${runId}` : null, executedToolCallId || "-")}</td>
    </tr>`;
  });

  return layout(
    "Approvals",
    `<section class="section"><h1>Approvals</h1>
      ${filterForm("/admin/ui/approvals", [
        select("status", "status", filters.status, ["pending", "approved", "rejected", "executed", "expired"]),
        select("riskLevel", "riskLevel", filters.riskLevel, ["read", "write_low", "write_high", "external_send", "destructive"]),
        input("userId", "userId", filters.userId),
        input("runId", "runId", filters.runId),
        input("limit", "limit", filters.limit ?? 100)
      ])}
      ${table(
        [
          "id",
          "status",
          "riskLevel",
          "toolName",
          "summary",
          "expiresAt",
          "approvalCode",
          "run",
          "executedToolCallId"
        ],
        rows,
        "No approval requests found"
      )}
    </section>`
  );
}

export function renderDocumentsPage(
  documents: Row[],
  filters: FilterValues = {}
): string {
  const rows = documents.map((document) => `<tr>
    <td class="mono">${link(`/admin/ui/documents/${valueOf(document, "id")}/chunks`, valueOf(document, "id"))}</td>
    <td>${field(document, "title")}</td>
    <td>${field(document, "userId")}</td>
    <td>${field(document, "sourceType")}</td>
    <td>${escapeHtml(formatDate(valueOf(document, "createdAt")))}</td>
  </tr>`);

  return layout(
    "Documents",
    `<section class="section"><h1>Documents</h1>
      ${filterForm("/admin/ui/documents", [
        input("title", "title", filters.title),
        input("userId", "userId", filters.userId),
        input("limit", "limit", filters.limit ?? 100)
      ])}
      ${table(
        ["id", "title", "userId", "sourceType", "createdAt"],
        rows,
        "No documents found"
      )}
    </section>`
  );
}

export function renderDocumentChunksPage(documentId: number, chunks: Row[]): string {
  const rows = chunks.map((chunk) => `<tr>
    <td class="mono">${field(chunk, "chunkIndex")}</td>
    <td>${inlineList(metadataField(chunk, "headingPath"))}</td>
    <td>${escapeHtml(metadataField(chunk, "chunkType") ?? "-")}</td>
    <td class="preview">${escapeHtml(truncate(valueOf(chunk, "content"), 220))}</td>
    <td>${escapeHtml(boolText(valueOf(chunk, "hasEmbedding")))}</td>
    <td>${field(chunk, "embeddingModel")}</td>
    <td class="mono">${escapeHtml(valueOf(chunk, "dimensions") ?? valueOf(chunk, "embeddingDimensions") ?? "-")}</td>
  </tr>`);

  return layout(
    `Document ${documentId} chunks`,
    `<section class="section"><h1>Document ${escapeHtml(documentId)} chunks</h1>${table(
      ["chunkIndex", "headingPath", "chunkType", "content preview", "hasEmbedding", "embeddingModel", "dimensions"],
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

  const score = scoreJson as Row;
  const reasons = Array.isArray(score.failureReasons)
    ? score.failureReasons
    : [];

  return reasons.length ? reasons.map((reason) => escapeHtml(reason)).join("<br>") : "-";
}

function scoreRunId(scoreJson: unknown): number | null {
  if (!scoreJson || typeof scoreJson !== "object") {
    return null;
  }

  const runId = safeNumber((scoreJson as Row).runId);
  return runId && runId > 0 ? runId : null;
}

function renderFailureDebugPrompt(results: Row[]): string {
  const failed = results.filter((result) => !valueOf(result, "passed"));

  if (!failed.length) {
    return "";
  }

  const blocks = failed
    .map((result) => {
      const prompt = {
        caseId: valueOf(result, "caseId"),
        input: valueOf(result, "input"),
        output: valueOf(result, "output"),
        failureReasons:
          valueOf(result, "scoreJson") &&
          typeof valueOf(result, "scoreJson") === "object"
            ? (valueOf(result, "scoreJson") as Row).failureReasons
            : [],
        scoreJson: valueOf(result, "scoreJson")
      };

      return `<details class="debug-prompt" open><summary>${escapeHtml(valueOf(result, "caseId"))}</summary>${htmlPre(prompt)}</details>`;
    })
    .join("");

  return `<section class="section"><h2>Debug Prompt</h2>${blocks}</section>`;
}

export function renderEvalDetailPage(detail: {
  evalRun: Row;
  results: Row[];
}): string {
  const rows = detail.results.map((result) => {
    const runId = scoreRunId(valueOf(result, "scoreJson"));

    return `<tr>
      <td>${field(result, "caseId")}</td>
      <td>${field(result, "category")}</td>
      <td>${badge(valueOf(result, "passed") ? "passed" : "failed")}</td>
      <td>${failureReasons(valueOf(result, "scoreJson"))}</td>
      <td class="preview">${escapeHtml(truncate(valueOf(result, "input"), 120))}</td>
      <td class="preview">${escapeHtml(truncate(valueOf(result, "output"), 160))}</td>
      <td class="mono">${runId ? link(`/admin/ui/runs/${runId}`, runId) : "-"}</td>
      <td><details><summary>scoreJson</summary><pre>${escapeHtml(prettyJson(valueOf(result, "scoreJson")))}</pre></details></td>
    </tr>`;
  });

  return layout(
    `Eval ${valueOf(detail.evalRun, "id")}`,
    `<section class="section">
      <h1>Eval ${escapeHtml(valueOf(detail.evalRun, "id"))}</h1>
      ${rowsFromKeyValues(detail.evalRun, ["id", "total", "passed", "failed", "passRate", "startedAt", "finishedAt"])}
    </section>
    ${renderFailureDebugPrompt(detail.results)}
    <section class="section"><h2>eval_results</h2>${table(
      ["caseId", "category", "passed", "failureReasons", "input", "output", "run", "scoreJson"],
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

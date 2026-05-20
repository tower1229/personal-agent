export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export const safeHtml = escapeHtml;

export function formatDate(value: unknown): string {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

export function truncate(value: unknown, maxLength = 120): string {
  const text = String(value ?? "");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

export function prettyJson(value: unknown): string {
  if (value === null || typeof value === "undefined" || value === "") {
    return "";
  }

  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return JSON.stringify(value, null, 2);
}

export const formatJson = prettyJson;

export function htmlPre(value: unknown): string {
  const rendered = prettyJson(value);

  if (!rendered) {
    return '<span class="muted">-</span>';
  }

  return `<pre>${escapeHtml(rendered)}</pre>`;
}

export const renderJsonBlock = htmlPre;

export function badge(value: unknown): string {
  const status = String(value ?? "-");
  const className = statusBadgeClass(status);

  return `<span class="badge ${className}">${escapeHtml(status)}</span>`;
}

export const statusBadge = badge;

export function statusBadgeClass(status: string): string {
  if (["succeeded", "passed", "approved", "executed"].includes(status)) {
    return "badge-green";
  }

  if (["failed"].includes(status)) {
    return "badge-red";
  }

  if (["running", "pending"].includes(status)) {
    return "badge-yellow";
  }

  if (["rejected", "expired", "skipped"].includes(status)) {
    return "badge-gray";
  }

  return "badge-gray";
}

export function valueOf(row: Record<string, unknown>, key: string): unknown {
  return row[key];
}

export function field(row: Record<string, unknown>, key: string): string {
  return escapeHtml(valueOf(row, key) ?? "-");
}

export function isExpired(expiresAt: unknown, status: unknown): boolean {
  if (status === "expired") {
    return true;
  }

  if (status !== "pending" || !expiresAt) {
    return false;
  }

  const date = expiresAt instanceof Date ? expiresAt : new Date(String(expiresAt));

  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
}

export function isHighRisk(riskLevel: unknown): boolean {
  return ["write_high", "external_send", "destructive", "high"].includes(
    String(riskLevel ?? "")
  );
}

export function boolText(value: unknown): string {
  return value ? "yes" : "no";
}

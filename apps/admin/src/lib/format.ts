export function formatDateTime(value: number | null): string {
  if (value === null) {
    return "-";
  }

  return new Date(value).toLocaleString();
}

export function truncateText(value: string | null, maxLength = 96): string {
  if (!value) {
    return "-";
  }

  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}

export function parseLocalYMD(ymd: string): number | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m - 1, d).getTime();
}

export function formatLocalYMD(timestamp: number | null): string {
  if (timestamp === null) return "";
  const d = new Date(timestamp);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dStr = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dStr}`;
}

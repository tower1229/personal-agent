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

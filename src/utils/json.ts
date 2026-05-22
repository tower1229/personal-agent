export function parseJsonOrValue(value: string | null): unknown {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function parseJsonOrNull(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function parseNumberArrayJson(value: string): number[] | null {
  const parsed = parseJsonOrNull(value);

  if (
    Array.isArray(parsed) &&
    parsed.every((item) => typeof item === "number" && Number.isFinite(item))
  ) {
    return parsed;
  }

  return null;
}

export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function pickNonEmpty<T>(items: (T | null | undefined)[]): T | null {
  for (const item of items) {
    if (item !== null && item !== undefined) return item;
  }
  return null;
}

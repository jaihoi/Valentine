type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 350;
  const maxDelayMs = options.maxDelayMs ?? 2000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;

      const jitter = Math.floor(Math.random() * 120);
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt + jitter);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

type BreakerState = {
  failures: number;
  openedAt: number | null;
};

const breakerStore = new Map<string, BreakerState>();

type CircuitOptions = {
  failureThreshold?: number;
  openForMs?: number;
};

export async function withCircuitBreaker<T>(
  key: string,
  operation: () => Promise<T>,
  options: CircuitOptions = {},
): Promise<T> {
  const failureThreshold = options.failureThreshold ?? 3;
  const openForMs = options.openForMs ?? 20_000;
  const current = breakerStore.get(key) ?? { failures: 0, openedAt: null };

  if (current.openedAt && Date.now() - current.openedAt < openForMs) {
    throw new Error(`${key} circuit is open`);
  }

  if (current.openedAt && Date.now() - current.openedAt >= openForMs) {
    breakerStore.set(key, { failures: 0, openedAt: null });
  }

  try {
    const result = await operation();
    breakerStore.set(key, { failures: 0, openedAt: null });
    return result;
  } catch (error) {
    const nextFailures = current.failures + 1;
    breakerStore.set(key, {
      failures: nextFailures,
      openedAt: nextFailures >= failureThreshold ? Date.now() : null,
    });
    throw error;
  }
}

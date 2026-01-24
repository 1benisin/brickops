export type RetryOptions = {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  jitterRatio?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withJitter = (delay: number, jitterRatio: number) => {
  const jitter = delay * jitterRatio;
  const min = delay - jitter;
  const max = delay + jitter;
  return Math.random() * (max - min) + min;
};

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    initialDelayMs = 200,
    maxDelayMs = 5_000,
    backoffFactor = 2,
    jitterRatio = 0.2,
  } = options;

  let delay = initialDelayMs;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }

      const sleepMs = Math.min(withJitter(delay, jitterRatio), maxDelayMs);
      await sleep(sleepMs);
      delay *= backoffFactor;
    }
  }

  throw new Error("Retry attempts exhausted");
}

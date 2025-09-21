export type CircuitBreakerOptions = {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenMaxAttempts?: number;
};

type State = "CLOSED" | "OPEN" | "HALF_OPEN";

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_RESET_TIMEOUT_MS = 30_000;
const DEFAULT_HALF_OPEN_ATTEMPTS = 1;

export class CircuitBreaker {
  private state: State = "CLOSED";
  private failureCount = 0;
  private nextAttemptAt = 0;
  private halfOpenAttempts = 0;

  constructor(private readonly options: CircuitBreakerOptions = {}) {}

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.assertCanProceed();

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private assertCanProceed() {
    if (this.state === "OPEN") {
      const now = Date.now();
      if (now >= this.nextAttemptAt) {
        this.state = "HALF_OPEN";
        this.halfOpenAttempts = 0;
      } else {
        throw new Error("Circuit breaker is open; rejecting request");
      }
    }

    if (this.state === "HALF_OPEN") {
      const maxAttempts = this.options.halfOpenMaxAttempts ?? DEFAULT_HALF_OPEN_ATTEMPTS;
      if (this.halfOpenAttempts >= maxAttempts) {
        throw new Error("Circuit breaker is stabilising; please retry later");
      }
      this.halfOpenAttempts += 1;
    }
  }

  private onSuccess() {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.halfOpenAttempts = 0;
  }

  private onFailure() {
    this.failureCount += 1;
    const threshold = this.options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;

    if (this.state === "HALF_OPEN") {
      this.trip();
      return;
    }

    if (this.failureCount >= threshold) {
      this.trip();
    }
  }

  private trip() {
    this.state = "OPEN";
    this.nextAttemptAt = Date.now() + (this.options.resetTimeoutMs ?? DEFAULT_RESET_TIMEOUT_MS);
    this.halfOpenAttempts = 0;
  }
}

type RetryOptions = {
  retries: number;
  delayMs?: number;
};

export async function withRetry<T>(
  task: (attempt: number) => Promise<T>,
  { retries, delayMs = 0 }: RetryOptions
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < retries && delayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, delayMs * (attempt + 1));
        });
      }
    }
  }
  throw lastError;
}

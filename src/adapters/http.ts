export interface PostJsonOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export async function postJson(
  url: string,
  body: unknown,
  opts: PostJsonOptions = {},
): Promise<unknown> {
  const { headers = {}, timeoutMs = 60_000, retries = 2 } = opts;
  let lastError: Error = new Error("unreachable");

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (RETRYABLE_STATUS.has(res.status)) {
        lastError = new Error(`Target returned ${res.status}`);
        continue;
      }
      if (!res.ok) {
        throw new Error(`Target returned ${res.status}: ${await res.text()}`);
      }
      return await res.json();
    } catch (err) {
      // TimeoutError from AbortSignal.timeout, TypeError from network failure
      if (
        err instanceof Error &&
        (err.name === "TimeoutError" || err.name === "AbortError" || err instanceof TypeError)
      ) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

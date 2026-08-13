import { log } from "./log.js";

/* Resilient HTTP GET built on Node's global fetch (Node 18+). Features:
 *  - configurable User-Agent
 *  - retries with exponential backoff on 429/5xx/network errors
 *  - honours Retry-After on 429
 *  - request timeout via AbortController
 * No third-party HTTP library — smaller attack surface. */

export interface HttpOptions {
  userAgent: string;
  maxRetries: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchText(
  url: string,
  opts: HttpOptions,
): Promise<{ status: number; body: string }> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  let attempt = 0;
  // total attempts = maxRetries + 1
  for (;;) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": opts.userAgent,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "nl,en;q=0.8",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        if (attempt > opts.maxRetries + 1) {
          return { status: res.status, body: await safeText(res) };
        }
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoff(attempt);
        log.warn(`HTTP ${res.status} on ${short(url)} — retry ${attempt} in ${Math.round(wait)}ms`);
        await sleep(wait);
        continue;
      }

      return { status: res.status, body: await safeText(res) };
    } catch (err) {
      clearTimeout(timer);
      if (attempt > opts.maxRetries + 1) {
        throw new Error(`Network error on ${short(url)} after ${attempt} attempts: ${(err as Error).message}`);
      }
      const wait = backoff(attempt);
      log.warn(`Network error on ${short(url)} — retry ${attempt} in ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
}

export async function fetchJson<T>(url: string, opts: HttpOptions): Promise<{ status: number; data: T | null }> {
  const { status, body } = await fetchText(url, opts);
  if (status < 200 || status >= 300) return { status, data: null };
  try {
    return { status, data: JSON.parse(body) as T };
  } catch {
    return { status, data: null };
  }
}

function backoff(attempt: number): number {
  const base = Math.min(16_000, 500 * 2 ** (attempt - 1));
  return base + Math.random() * 250; // jitter
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function short(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? u.search : "");
  } catch {
    return url;
  }
}

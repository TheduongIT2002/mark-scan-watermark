const DEFAULT_ENDPOINT = "http://127.0.0.1:8384";

export interface LamaClientOptions {
  endpoint?: string;
  signal?: AbortSignal;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_BACKOFF_MS = 500;
const DEFAULT_MAX_BACKOFF_MS = 8000;

export function getLamaEndpoint(explicit?: string): string {
  const configured = explicit || process.env.NEXT_PUBLIC_MARKSCAN_AI_URL || DEFAULT_ENDPOINT;
  return configured.replace(/\/+$/, "");
}

export function parseRetryAfter(headerValue: string | null, maxBackoffMs: number): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(maxBackoffMs, Math.max(0, seconds * 1000));
  }

  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return Math.min(maxBackoffMs, Math.max(0, diff));
  }

  return null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function requestLamaInpaint(
  image: File,
  mask: Blob,
  options: LamaClientOptions = {},
): Promise<Blob> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  const endpoint = getLamaEndpoint(options.endpoint);
  const signal = options.signal;

  let attempt = 0;

  while (true) {
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
    }

    const form = new FormData();
    form.append("image", image, image.name);
    form.append("mask", mask, "gemini-mask.png");

    let response: Response;
    try {
      response = await fetch(`${endpoint}/v1/inpaint`, {
        method: "POST",
        body: form,
        signal,
      });
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
      if (attempt < maxRetries) {
        const backoff = Math.min(maxBackoffMs, initialBackoffMs * Math.pow(2, attempt));
        attempt++;
        await sleep(backoff, signal);
        continue;
      }
      throw error;
    }

    if (response.ok) {
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) {
        throw new Error("LaMa service returned a non-image response.");
      }
      return response.blob();
    }

    const status = response.status;
    const isTransient = TRANSIENT_STATUS_CODES.has(status);

    if (isTransient && attempt < maxRetries) {
      const retryAfterHeader = response.headers.get("retry-after");
      const parsedRetryAfter = parseRetryAfter(retryAfterHeader, maxBackoffMs);
      const backoff = parsedRetryAfter ?? Math.min(maxBackoffMs, initialBackoffMs * Math.pow(2, attempt));
      attempt++;
      await sleep(backoff, signal);
      continue;
    }

    const detail = await response.text().catch(() => "");
    throw new Error(`LaMa service returned ${status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
}

export async function checkLamaHealth(endpoint?: string): Promise<boolean> {
  try {
    const response = await fetch(`${getLamaEndpoint(endpoint)}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

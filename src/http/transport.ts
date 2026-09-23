import {
  ScoplApiError,
  ScoplNetworkError,
  ScoplTimeoutError,
  ScoplValidationError,
  ScoplVersionError
} from "./errors.js";
import { record } from "../utils/validation.js";
import { sleep } from "../utils/sleep.js";

export type ScoplFetch = typeof globalThis.fetch;

export interface ScoplTransportOptions {
  baseUrl: string;
  fetch?: ScoplFetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  random?: () => number;
}

export interface JsonRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  acceptedStatuses?: readonly number[];
  retry?: boolean;
}

export interface JsonResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  apiVersion: string | null;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ScoplValidationError("baseUrl must be an absolute URL.", "baseUrl");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ScoplValidationError("baseUrl must use HTTP or HTTPS.", "baseUrl");
  }
  if (url.username || url.password) {
    throw new ScoplValidationError("baseUrl must not contain credentials.", "baseUrl");
  }
  return url.toString().replace(/\/+$/, "");
}

function apiMajor(version: string): number | null {
  const match = /^(\d+)(?:\.|$)/.exec(version.trim());
  return match ? Number(match[1]) : null;
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return null;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.max(0, Number(value) * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function apiErrorFrom(status: number, body: unknown): ScoplApiError {
  try {
    const root = record(body);
    const error = record(root.error, "error");
    return new ScoplApiError({
      status,
      code: typeof error.code === "string" ? error.code : `HTTP_${status}`,
      message: typeof error.message === "string"
        ? error.message
        : `SCOPL API returned HTTP ${status}.`,
      details: error.details
    });
  } catch {
    return new ScoplApiError({
      status,
      code: `HTTP_${status}`,
      message: `SCOPL API returned HTTP ${status}.`,
      details: body
    });
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) throw new ScoplValidationError("SCOPL API returned an empty JSON body.");
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new ScoplValidationError("SCOPL API returned malformed JSON.", undefined, { cause });
  }
}

export class ScoplTransport {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  private readonly fetcher: ScoplFetch;
  private readonly retryBaseDelayMs: number;
  private readonly random: () => number;
  private observedApiVersion: string | null = null;

  constructor(options: ScoplTransportOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetcher = options.fetch ?? globalThis.fetch;
    if (!this.fetcher) throw new ScoplValidationError("A Fetch API implementation is required.");
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 250;
    this.random = options.random ?? Math.random;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs >= 30_000) {
      throw new ScoplValidationError("timeoutMs must be a positive integer below 30000.");
    }
    if (!Number.isSafeInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 5) {
      throw new ScoplValidationError("maxRetries must be an integer from 0 through 5.");
    }
  }

  get apiVersion(): string | null {
    return this.observedApiVersion;
  }

  url(path: string, query?: Record<string, string | number | undefined>): URL {
    if (!path.startsWith("/")) throw new ScoplValidationError("API path must start with '/'.");
    const url = new URL(path, `${this.baseUrl}/`);
    if (url.origin !== new URL(this.baseUrl).origin) {
      throw new ScoplValidationError("API path changed the configured origin.");
    }
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    return url;
  }

  async json<T>(
    path: string,
    options: JsonRequestOptions,
    validate: (value: unknown) => T,
    query?: Record<string, string | number | undefined>
  ): Promise<JsonResponse<T>> {
    const accepted = new Set(options.acceptedStatuses ?? [200]);
    const canRetry = options.retry !== false;
    const url = this.url(path, query);
    let lastNetworkError: unknown;

    for (let attempt = 0; attempt <= (canRetry ? this.maxRetries : 0); attempt += 1) {
      if (options.signal?.aborted) throw options.signal.reason;
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.timeoutMs);
      const abort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", abort, { once: true });
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: options.method ?? "GET",
          headers: options.body === undefined
            ? { accept: "application/json" }
            : { accept: "application/json", "content-type": "application/json" },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
          credentials: "omit"
        });
      } catch (cause) {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", abort);
        if (options.signal?.aborted) throw options.signal.reason;
        if (timedOut) throw new ScoplTimeoutError(this.timeoutMs, { cause });
        lastNetworkError = cause;
        if (attempt < (canRetry ? this.maxRetries : 0)) {
          await this.backoff(attempt, options.signal);
          continue;
        }
        throw new ScoplNetworkError("SCOPL API request failed.", { cause });
      }
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);

      const version = response.headers.get("X-SCOPL-API-Version");
      if (version) {
        this.observedApiVersion = version;
        if (apiMajor(version) !== 2) throw new ScoplVersionError(2, version);
      }

      if (response.status === 503 && attempt < (canRetry ? this.maxRetries : 0)) {
        await response.arrayBuffer();
        const delay = retryAfterMilliseconds(response);
        if (delay !== null) await sleep(delay, options.signal);
        else await this.backoff(attempt, options.signal);
        continue;
      }

      const body = await parseJson(response);
      if (!accepted.has(response.status)) throw apiErrorFrom(response.status, body);
      return {
        data: validate(body),
        status: response.status,
        headers: response.headers,
        apiVersion: version
      };
    }
    throw new ScoplNetworkError("SCOPL API request failed.", { cause: lastNetworkError });
  }

  private async backoff(attempt: number, signal?: AbortSignal): Promise<void> {
    const exponential = this.retryBaseDelayMs * (2 ** attempt);
    const jitter = 0.75 + this.random() * 0.5;
    await sleep(Math.round(exponential * jitter), signal);
  }
}

import { describe, expect, it, vi } from "vitest";

import {
  ScoplNetworkError,
  ScoplTimeoutError,
  ScoplValidationError,
  ScoplVersionError
} from "../src/http/errors.js";
import type { ScoplApiError } from "../src/http/errors.js";
import { ScoplTransport, type ScoplFetch } from "../src/http/transport.js";
import { jsonResponse } from "./fixtures.js";

describe("SCOPL HTTP transport", () => {
  it("normalizes the base URL and uses a custom fetch", async () => {
    const fetch = vi.fn<ScoplFetch>(async () => jsonResponse({ ok: true }));
    const transport = new ScoplTransport({ baseUrl: "https://api.example///", fetch });
    const response = await transport.json("/hello", {}, (value) => value);

    expect(transport.baseUrl).toBe("https://api.example");
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://api.example/hello");
    expect(response.data).toEqual({ ok: true });
  });

  it("times out a blocked request", async () => {
    const fetch = ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })) as ScoplFetch;
    const transport = new ScoplTransport({
      baseUrl: "https://api.example",
      fetch,
      timeoutMs: 5,
      maxRetries: 0
    });

    await expect(transport.json("/slow", {}, (value) => value))
      .rejects.toBeInstanceOf(ScoplTimeoutError);
  });

  it("parses structured API errors without retrying 400 or 422", async () => {
    for (const status of [400, 422]) {
      const fetch = vi.fn<ScoplFetch>(async () => jsonResponse({
        error: { code: "INVALID_REQUEST", message: "Nope", details: { field: "x" } }
      }, status));
      const transport = new ScoplTransport({
        baseUrl: "https://api.example",
        fetch,
        maxRetries: 3,
        retryBaseDelayMs: 0
      });
      const promise = transport.json("/error", {}, (value) => value);
      await expect(promise).rejects.toMatchObject({
        status,
        code: "INVALID_REQUEST",
        message: "Nope",
        details: { field: "x" }
      } satisfies Partial<ScoplApiError>);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects malformed JSON and malformed success payloads", async () => {
    const malformed = new ScoplTransport({
      baseUrl: "https://api.example",
      fetch: (async () => new Response("{", { status: 200 })) as ScoplFetch
    });
    await expect(malformed.json("/bad", {}, (value) => value))
      .rejects.toBeInstanceOf(ScoplValidationError);

    const invalid = new ScoplTransport({
      baseUrl: "https://api.example",
      fetch: (async () => jsonResponse({ nope: true })) as ScoplFetch
    });
    await expect(invalid.json("/bad", {}, () => {
      throw new ScoplValidationError("invalid payload");
    })).rejects.toThrow("invalid payload");
  });

  it("retries 503 and network failures with bounded attempts", async () => {
    let attempts = 0;
    const fetch = (async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("network");
      if (attempts === 2) return jsonResponse({ error: { code: "BUSY", message: "busy" } }, 503);
      return jsonResponse({ ok: true });
    }) as ScoplFetch;
    const transport = new ScoplTransport({
      baseUrl: "https://api.example",
      fetch,
      maxRetries: 2,
      retryBaseDelayMs: 0,
      random: () => 0
    });

    await expect(transport.json("/retry", {}, (value) => value))
      .resolves.toMatchObject({ data: { ok: true } });
    expect(attempts).toBe(3);

    const failed = new ScoplTransport({
      baseUrl: "https://api.example",
      fetch: (async () => { throw new Error("offline"); }) as ScoplFetch,
      maxRetries: 1,
      retryBaseDelayMs: 0
    });
    await expect(failed.json("/retry", {}, (value) => value))
      .rejects.toBeInstanceOf(ScoplNetworkError);
  });

  it("lets AbortSignal interrupt retry backoff", async () => {
    const controller = new AbortController();
    const transport = new ScoplTransport({
      baseUrl: "https://api.example",
      fetch: (async () => { throw new Error("offline"); }) as ScoplFetch,
      maxRetries: 3,
      retryBaseDelayMs: 1_000
    });
    const pending = transport.json(
      "/retry",
      { signal: controller.signal },
      (value) => value
    );
    controller.abort(new Error("host aborted"));
    await expect(pending).rejects.toThrow("host aborted");
  });

  it("observes compatible API versions and rejects a new major", async () => {
    const compatible = new ScoplTransport({
      baseUrl: "https://api.example",
      fetch: (async () => jsonResponse({ ok: true }, 200, {
        "X-SCOPL-API-Version": "2.4.1"
      })) as ScoplFetch
    });
    await compatible.json("/version", {}, (value) => value);
    expect(compatible.apiVersion).toBe("2.4.1");

    const incompatible = new ScoplTransport({
      baseUrl: "https://api.example",
      fetch: (async () => jsonResponse({ ok: true }, 200, {
        "X-SCOPL-API-Version": "3.0.0"
      })) as ScoplFetch
    });
    await expect(incompatible.json("/version", {}, (value) => value))
      .rejects.toBeInstanceOf(ScoplVersionError);
  });
});

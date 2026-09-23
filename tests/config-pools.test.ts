import { describe, expect, it, vi } from "vitest";

import { ScoplClient, ScoplValidationError, filterPools } from "../src/index.js";
import type { ScoplFetch } from "../src/http/transport.js";
import { A, B, ZERO, configFixture, jsonResponse } from "./fixtures.js";

describe("configuration", () => {
  it("caches by default, refreshes on demand, and keeps metadata on the trusted origin", async () => {
    const fetch = vi.fn<ScoplFetch>(async () => jsonResponse(configFixture));
    const client = new ScoplClient({ baseUrl: "https://scopl.live", fetch });

    const first = await client.config.get();
    const cached = await client.config.get();
    const refreshed = await client.config.refresh();

    expect(first).toBe(cached);
    expect(refreshed.chains[0]?.id).toBe(4663);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(first.endpoints.quote).toBe("https://scopl.live/api/v2/limit-orders/quote");
    expect(Object.values(first.endpoints).every((url) => !url.includes("localhost"))).toBe(true);
  });

  it("looks up chains and venues and fails closed for unknown or disabled entries", async () => {
    const disabled = structuredClone(configFixture) as unknown as typeof configFixture;
    (disabled.chains[0].venues[1] as { enabled?: boolean }).enabled = false;
    const client = new ScoplClient({
      fetch: (async () => jsonResponse(disabled)) as ScoplFetch
    });

    expect((await client.config.getChain(4663)).v3.manager).toBe(A);
    await expect(client.config.getChain(1)).rejects.toBeInstanceOf(ScoplValidationError);
    await expect(client.config.getVenue(4663, "ramses-v3"))
      .rejects.toBeInstanceOf(ScoplValidationError);
  });
});

describe("pool directory", () => {
  const pools = [{
    address: A,
    pair: "AAA/BBB",
    baseTokenAddress: A,
    quoteTokenAddress: B,
    dexId: "ramses",
    version: "v3" as const,
    supported: true,
    analyticsCanChange: "kept"
  }, {
    address: B,
    pair: "BBB/AAA",
    baseTokenAddress: B,
    quoteTokenAddress: A,
    dexId: "uniswap",
    version: "v4" as const,
    supported: true
  }];

  it("keeps raw additive fields and supports safe filters", async () => {
    const fetch = vi.fn<ScoplFetch>(async () => jsonResponse({
      data: pools,
      source: "scopl-indexer",
      chainId: 4663,
      blockNumber: "70000000",
      updatedAt: "2026-09-22T00:00:00.000Z",
      page: 1,
      limit: 300,
      total: 2
    }));
    const client = new ScoplClient({ fetch });
    const result = await client.pools.list({
      chainId: 4663,
      venueId: "ramses-v3",
      token: B,
      quoteToken: A
    });

    expect(result.total).toBe(1);
    expect(result.chainId).toBe(4663);
    expect(result.data[0]?.analyticsCanChange).toBe("kept");
    expect(filterPools(pools, { protocolVersion: 4 })).toHaveLength(1);
    expect(String(fetch.mock.calls[0]?.[0])).toContain("chainId=4663");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to exhaustive token discovery only when the ranked directory misses", async () => {
    const unranked = {
      address: "0x3333333333333333333333333333333333333333",
      pair: "AAA/QUOTE",
      baseTokenAddress: A,
      quoteTokenAddress: "0x4444444444444444444444444444444444444444" as const,
      dexId: "ramses",
      version: "v3" as const,
      supported: true
    };
    const responses = [{
      data: [],
      source: "scopl-indexer",
      chainId: 4663,
      updatedAt: "2026-09-22T00:00:00.000Z",
      page: 1,
      limit: 300,
      total: 0
    }, {
      data: [unranked],
      source: "scopl-indexer",
      chainId: 4663,
      updatedAt: "2026-09-22T00:01:00.000Z",
      page: 1,
      limit: 1,
      total: 1
    }];
    const fetch = vi.fn<ScoplFetch>(async () => jsonResponse(responses.shift()));
    const client = new ScoplClient({ fetch });

    const result = await client.pools.list({
      chainId: 4663,
      token: A,
      quoteToken: unranked.quoteTokenAddress,
      protocolVersion: 3
    });

    expect(result.data).toEqual([unranked]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const fallbackUrl = new URL(String(fetch.mock.calls[1]?.[0]));
    expect(fallbackUrl.searchParams.get("token")).toBe(A);
    expect(fallbackUrl.searchParams.get("quoteToken")).toBe(unranked.quoteTokenAddress);
    expect(fallbackUrl.searchParams.get("protocolVersion")).toBe("3");
    expect(fallbackUrl.searchParams.has("venueId")).toBe(false);
  });

  it("accepts the server's native-to-wrapped token resolution for indexed V3 pools", async () => {
    const wrappedPool = {
      address: "0x3333333333333333333333333333333333333333",
      pair: "AAA/WETH",
      baseTokenAddress: A,
      quoteTokenAddress: B,
      dexId: "ramses",
      version: "v3" as const,
      supported: true
    };
    const responses = [
      jsonResponse({
        data: [], source: "scopl-indexer", chainId: 4663,
        updatedAt: "2026-09-22T00:00:00.000Z", page: 1, limit: 300, total: 0
      }),
      jsonResponse({
        data: [wrappedPool], source: "scopl-indexer", chainId: 4663,
        updatedAt: "2026-09-22T00:01:00.000Z", page: 1, limit: 1, total: 1
      }, 200, { "X-SCOPL-Pool-Snapshot": "TOKEN_INDEX" })
    ];
    const fetch = vi.fn<ScoplFetch>(async () => responses.shift()!);
    const client = new ScoplClient({ fetch });

    const result = await client.pools.list({
      chainId: 4663,
      venueId: "ramses-v3",
      token: A,
      quoteToken: ZERO
    });

    expect(result.data).toEqual([wrappedPool]);
  });

  it("fails closed when the pool directory answers for a different chain", async () => {
    const fetch = vi.fn<ScoplFetch>(async () => jsonResponse({
      data: pools,
      source: "scopl-indexer",
      chainId: 1,
      updatedAt: "2026-09-22T00:00:00.000Z",
      page: 1,
      limit: 300,
      total: 2
    }));
    const client = new ScoplClient({ fetch });

    await expect(client.pools.list({ chainId: 4663 }))
      .rejects.toMatchObject({ path: "pools.chainId" });
  });

  it("rejects invalid chain identifiers before requesting the directory", async () => {
    const fetch = vi.fn<ScoplFetch>();
    const client = new ScoplClient({ fetch });

    await expect(client.pools.list({ chainId: 0 }))
      .rejects.toMatchObject({ path: "chainId" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed token filters before requesting the directory", async () => {
    const fetch = vi.fn<ScoplFetch>();
    const client = new ScoplClient({ fetch });

    await expect(client.pools.list({
      quoteToken: "not-an-address" as `0x${string}`
    })).rejects.toMatchObject({ path: "quoteToken" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

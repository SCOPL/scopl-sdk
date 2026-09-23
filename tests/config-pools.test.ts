import { describe, expect, it, vi } from "vitest";

import { ScoplClient, ScoplValidationError, filterPools } from "../src/index.js";
import type { ScoplFetch } from "../src/http/transport.js";
import { A, B, configFixture, jsonResponse } from "./fixtures.js";

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
      blockNumber: "70000000",
      updatedAt: "2026-09-22T00:00:00.000Z",
      page: 1,
      limit: 300,
      total: 2
    }));
    const client = new ScoplClient({ fetch });
    const result = await client.pools.list({ venueId: "ramses-v3", token: B });

    expect(result.total).toBe(1);
    expect(result.data[0]?.analyticsCanChange).toBe("kept");
    expect(filterPools(pools, { protocolVersion: 4 })).toHaveLength(1);
  });
});

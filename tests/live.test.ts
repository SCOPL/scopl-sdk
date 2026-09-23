/// <reference types="node" />

import { describe, expect, it } from "vitest";

import { ScoplClient } from "../src/index.js";

const live = process.env.SCOPL_SDK_LIVE_TESTS === "1";

describe.skipIf(!live)("live read-only SCOPL API", () => {
  const client = new ScoplClient();

  it("serves current config without localhost endpoint metadata", async () => {
    const config = await client.config.refresh();
    expect(config.apiVersion.startsWith("2.")).toBe(true);
    expect(Object.values(config.endpoints).every((url) => !url.includes("localhost"))).toBe(true);
  });

  it("serves OpenAPI and the indexed pool directory", async () => {
    const [openapi, pools] = await Promise.all([
      fetch("https://scopl.live/api/v2/openapi.json"),
      client.pools.list()
    ]);
    expect(openapi.ok).toBe(true);
    const document = await openapi.json() as {
      openapi?: string;
      paths?: Record<string, unknown>;
    };
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths).toHaveProperty("/api/indexer/pools");
    expect(pools.source).toBe("scopl-indexer");
    expect(pools.chainId).toBe(4663);
  });

  it("returns reusable plain-decimal prices for a live V4 pool", async () => {
    const pools = await client.pools.list({
      venueId: "uniswap-v4",
      protocolVersion: 4
    });
    const pool = pools.data.find((candidate) => candidate.supported);
    expect(pool).toBeDefined();

    const prices = await client.limitOrders.prices({
      chainId: 4663,
      venueId: "uniswap-v4",
      pool: pool!.address,
      tokenIn: pool!.baseTokenAddress,
      count: 3
    });
    expect(prices.options.length).toBeGreaterThan(0);
    for (const option of prices.options) {
      expect(option.executionPrice).toMatch(/^\d+(?:\.\d+)?$/);
    }
  });
});

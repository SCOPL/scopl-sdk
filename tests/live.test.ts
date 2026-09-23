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
    expect((await openapi.json() as { openapi?: string }).openapi).toBe("3.1.0");
    expect(pools.source).toBe("scopl-indexer");
  });
});

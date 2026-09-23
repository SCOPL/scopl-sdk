import { describe, expect, it, vi } from "vitest";

import { ScoplClient, ScoplTimeoutError } from "../src/index.js";
import type { ScoplApiError } from "../src/index.js";
import type { ScoplFetch } from "../src/http/transport.js";
import { A, B, C, HASH, fetchSequence, jsonResponse, receiptFixture } from "./fixtures.js";

const pending = {
  apiVersion: "2.0.0",
  chainId: 4663,
  status: "pending",
  transactionHash: HASH,
  retryAfterMs: 1
} as const;

describe("creation receipts", () => {
  it("returns one pending response and waits through 202 to a confirmed receipt", async () => {
    const once = fetchSequence(jsonResponse(pending, 202));
    const onceClient = new ScoplClient({ fetch: once.fetch });
    await expect(onceClient.limitOrders.getReceipt({ chainId: 4663, transactionHash: HASH }))
      .resolves.toMatchObject({ status: "pending", retryAfterMs: 1 });

    const sequence = fetchSequence(
      jsonResponse(pending, 202, { "Retry-After": "10" }),
      jsonResponse(receiptFixture)
    );
    const client = new ScoplClient({ fetch: sequence.fetch });
    const receipt = await client.limitOrders.waitForReceipt({
      chainId: 4663,
      transactionHash: HASH,
      maxWaitMs: 100
    });
    expect(receipt.orderId).toBe("42");
    expect(sequence.calls).toHaveLength(2);
    expect(sequence.calls[0]?.searchParams.get("transactionHash")).toBe(HASH);
  });

  it("surfaces reverted and missing-event receipts as stable API errors", async () => {
    for (const code of ["CREATE_TRANSACTION_REVERTED", "ORDER_CREATED_EVENT_NOT_FOUND"]) {
      const client = new ScoplClient({
        fetch: (async () => jsonResponse({ error: { code, message: code } }, 422)) as ScoplFetch
      });
      await expect(client.limitOrders.getReceipt({ chainId: 4663, transactionHash: HASH }))
        .rejects.toMatchObject({ code, status: 422 } satisfies Partial<ScoplApiError>);
    }
  });

  it("times out before another receipt poll would exceed the max wait", async () => {
    const client = new ScoplClient({
      fetch: (async () => jsonResponse({ ...pending, retryAfterMs: 50 }, 202)) as ScoplFetch
    });
    await expect(client.limitOrders.waitForReceipt({
      chainId: 4663,
      transactionHash: HASH,
      timeoutMs: 10
    })).rejects.toBeInstanceOf(ScoplTimeoutError);
  });
});

function eventPage(nextLiveSeq: string, hasMore: boolean, liveSeq = nextLiveSeq) {
  return {
    apiVersion: "2.0.0",
    chainId: 4663,
    owner: A,
    data: [{
      liveSeq,
      protocolVersion: 3,
      venueId: "ramses-v3",
      positionManager: B,
      managerAddress: C,
      orderId: "42",
      event: "OrderExecuted",
      blockNumber: "70000000",
      transactionHash: HASH,
      transactionIndex: 2,
      logIndex: 7,
      payload: { owner: A },
      indexedAt: "2026-09-22T00:00:00.000Z"
    }],
    nextLiveSeq,
    hasMore,
    pollAfterMs: hasMore ? 0 : 1
  };
}

describe("owner events", () => {
  it("keeps decimal cursors, page order, and exposes transactionHash + logIndex dedupe", async () => {
    const sequence = fetchSequence(jsonResponse(eventPage("90071992547409930001", false)));
    const client = new ScoplClient({ fetch: sequence.fetch });
    const page = await client.limitOrders.events({ chainId: 4663, owner: A, after: "9" });

    expect(page.nextLiveSeq).toBe("90071992547409930001");
    expect(page.data[0]?.dedupeKey).toBe(`${HASH}:7`);
    expect(sequence.calls[0]?.searchParams.get("after")).toBe("9");
  });

  it("advances only after the yielded page is processed and fetches hasMore immediately", async () => {
    const requestedAfter: Array<string | null> = [];
    const responses = [eventPage("10", true), eventPage("11", false)];
    const fetch = vi.fn<ScoplFetch>(async (input) => {
      requestedAfter.push(new URL(String(input)).searchParams.get("after"));
      return jsonResponse(responses[requestedAfter.length - 1]);
    });
    const client = new ScoplClient({ fetch });
    const iterator = client.limitOrders.iterateEvents({
      chainId: 4663,
      owner: A,
      after: "0",
      poll: false
    });

    expect((await iterator.next()).value?.nextLiveSeq).toBe("10");
    expect(requestedAfter).toEqual(["0"]);
    expect((await iterator.next()).value?.nextLiveSeq).toBe("11");
    expect(requestedAfter).toEqual(["0", "10"]);
    expect((await iterator.next()).done).toBe(true);
  });
});

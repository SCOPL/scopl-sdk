import { describe, expect, it, vi } from "vitest";

import {
  ScoplClient,
  ScoplTransactionPlanError,
  ScoplValidationError,
  validateQuoteTransactionPlan
} from "../src/index.js";
import type { QuoteRequest, QuoteResponse } from "../src/index.js";
import type { ScoplFetch } from "../src/http/transport.js";
import { A, B, C, D, ID, POOL_ID, ZERO, configFixture, jsonResponse, quoteFixture } from "./fixtures.js";

const request: QuoteRequest = {
  chainId: 4663,
  integrationId: ID,
  venueId: "ramses-v3",
  pool: A,
  tokenIn: C,
  amountIn: "1000000000000000001",
  price: "1.234567890123456789",
  slippageBps: 100,
  deadlineSeconds: 600,
  priceOptionCount: 9
};

describe("quote client", () => {
  it("preserves decimal strings, owner optionality, Ramses venue, and transaction order", async () => {
    let posted: unknown;
    const fetch = vi.fn<ScoplFetch>(async (_input, init) => {
      posted = JSON.parse(String(init?.body)) as unknown;
      return jsonResponse(quoteFixture);
    });
    const client = new ScoplClient({ fetch });
    const quote = await client.limitOrders.quote(request);

    expect(posted).toMatchObject({
      amountIn: request.amountIn,
      price: request.price,
      venueId: "ramses-v3"
    });
    expect(posted).not.toHaveProperty("owner");
    expect(quote.transactions.map((step) => step.kind))
      .toEqual(["approve-token", "create-order"]);
    expect(quote.price).toMatchObject({
      requestedPrice: "1.2345",
      executionPrice: "1.2344",
      adjustmentReason: "tick-rounding"
    });
  });

  it("validates quote limits and bytes32 integration IDs", async () => {
    const client = new ScoplClient({ fetch: (async () => jsonResponse(quoteFixture)) as ScoplFetch });
    const invalid = [
      { ...request, integrationId: ZERO },
      { ...request, slippageBps: 5_001 },
      { ...request, deadlineSeconds: 59 },
      { ...request, priceOptionCount: 22 }
    ];
    for (const item of invalid) {
      await expect(client.limitOrders.quote(item as QuoteRequest))
        .rejects.toBeInstanceOf(ScoplValidationError);
    }
  });
});

describe("native and transaction-plan validation", () => {
  function clientWith(config = configFixture): ScoplClient {
    return new ScoplClient({ fetch: (async () => jsonResponse(config)) as ScoplFetch });
  }

  function quoteFor(
    manager: typeof A | typeof D,
    positionManager: typeof B,
    transactions: QuoteResponse["transactions"]
  ): QuoteResponse {
    return {
      ...quoteFixture,
      warnings: [...quoteFixture.warnings],
      protocol: { ...quoteFixture.protocol, manager, positionManager },
      transactions
    };
  }

  it("accepts V3 WETH native funding and preserves exact returned value", async () => {
    const client = clientWith();
    const nativeRequest = { ...request, venueId: "uniswap-v3" as const, tokenIn: C, funding: "native" as const };
    const quote = quoteFor(A, B, [{
      kind: "create-order", to: A, data: "0x12", value: "1000150000000000001",
      required: true, description: "create"
    }]);
    await expect(validateQuoteTransactionPlan({ config: client.config, request: nativeRequest, quote }))
      .resolves.toBeUndefined();
    expect(quote.transactions[0]?.value).toBe("1000150000000000001");
  });

  it("accepts V4 zero-address native and WETH direction aliases without inventing approvals", async () => {
    const client = clientWith();
    for (const tokenIn of [ZERO, C] as const) {
      const nativeRequest = {
        ...request,
        venueId: "uniswap-v4" as const,
        pool: POOL_ID,
        tokenIn,
        funding: "native" as const
      };
      const quote = quoteFor(D, B, [{
        kind: "create-order", to: D, data: "0x12", value: "123456789",
        required: true, description: "create"
      }]);
      await expect(validateQuoteTransactionPlan({ config: client.config, request: nativeRequest, quote }))
        .resolves.toBeUndefined();
    }
  });

  it("accepts the ERC-20 side of a V4 native pool and rejects zero-address approvals", async () => {
    const client = clientWith();
    const erc20Request = {
      ...request,
      venueId: "uniswap-v4" as const,
      pool: POOL_ID,
      tokenIn: A,
      funding: "erc20" as const
    };
    const valid = quoteFor(D, B, [{
      kind: "approve-token", to: A, data: "0x12", value: "0", required: true, description: "approve"
    }, {
      kind: "create-order", to: D, data: "0x34", value: "150000000000000",
      required: true, description: "create"
    }]);
    await expect(validateQuoteTransactionPlan({ config: client.config, request: erc20Request, quote: valid }))
      .resolves.toBeUndefined();

    const unsafe = { ...valid, transactions: valid.transactions.map((step, index) =>
      index === 0 ? { ...step, to: ZERO } : step) };
    await expect(validateQuoteTransactionPlan({ config: client.config, request: erc20Request, quote: unsafe }))
      .rejects.toBeInstanceOf(ScoplTransactionPlanError);
  });
});

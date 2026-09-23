import { describe, expect, it, vi } from "vitest";
import type { PublicClient, WalletClient } from "viem";

import { ScoplClient, ScoplTransactionPlanError } from "../src/index.js";
import type { TransactionStep } from "../src/index.js";
import { createLimitOrder, executeTransactionPlan } from "../src/viem/index.js";
import type { ScoplFetch } from "../src/http/transport.js";
import { A, B, C, HASH, ID, configFixture, jsonResponse, quoteFixture, receiptFixture } from "./fixtures.js";

const steps: TransactionStep[] = [{
  kind: "approve-token",
  to: C,
  data: "0x12",
  value: "0",
  required: false,
  description: "not required"
}, {
  kind: "authorize-position-manager",
  to: B,
  data: "0x34",
  value: "0",
  required: true,
  description: "authorize"
}, {
  kind: "create-order",
  to: A,
  data: "0x56",
  value: "90071992547409930001",
  required: true,
  description: "create"
}];

function clients(options: { failSendAt?: number; chainId?: number } = {}) {
  const sequence: string[] = [];
  let sent = 0;
  const call = vi.fn(async ({ to }: { to?: string }) => {
    sequence.push(`simulate:${to}`);
    return { data: "0x" };
  });
  const sendTransaction = vi.fn(async ({ to, value }: { to?: string; value?: bigint }) => {
    sent += 1;
    sequence.push(`send:${to}:${String(value)}`);
    if (sent === options.failSendAt) throw new Error("wallet rejected");
    return HASH;
  });
  const waitForTransactionReceipt = vi.fn(async () => {
    sequence.push("wait");
    return { status: "success", transactionHash: HASH };
  });
  return {
    sequence,
    walletClient: {
      chain: { id: options.chainId ?? 4663 },
      sendTransaction
    } as unknown as Pick<WalletClient, "chain" | "sendTransaction">,
    publicClient: {
      call,
      waitForTransactionReceipt
    } as unknown as Pick<PublicClient, "call" | "waitForTransactionReceipt">,
    sendTransaction
  };
}

describe("Viem transaction-plan executor", () => {
  it("runs only required steps, exactly in order, waiting after each, with exact bigint value", async () => {
    const mock = clients();
    const result = await executeTransactionPlan({
      steps,
      chainId: 4663,
      walletClient: mock.walletClient,
      publicClient: mock.publicClient,
      account: A
    });

    expect(result).toHaveLength(2);
    expect(mock.sequence).toEqual([
      `simulate:${B}`,
      `send:${B}:0`,
      "wait",
      `simulate:${A}`,
      `send:${A}:90071992547409930001`,
      "wait"
    ]);
    expect(mock.sendTransaction.mock.calls[1]?.[0]).toMatchObject({
      value: 90071992547409930001n
    });
  });

  it("fails on chain mismatch and unknown kinds", async () => {
    const mismatch = clients({ chainId: 1 });
    await expect(executeTransactionPlan({
      steps,
      chainId: 4663,
      walletClient: mismatch.walletClient,
      publicClient: mismatch.publicClient,
      account: A
    })).rejects.toBeInstanceOf(ScoplTransactionPlanError);

    const unknown = clients();
    await expect(executeTransactionPlan({
      steps: [{ ...steps[2]!, kind: "future-dangerous-step" }],
      chainId: 4663,
      walletClient: unknown.walletClient,
      publicClient: unknown.publicClient,
      account: A
    })).rejects.toBeInstanceOf(ScoplTransactionPlanError);
    expect(unknown.sendTransaction).not.toHaveBeenCalled();
  });

  it("stops after a failed transaction and reports completed transactions", async () => {
    const mock = clients({ failSendAt: 2 });
    try {
      await executeTransactionPlan({
        steps,
        chainId: 4663,
        walletClient: mock.walletClient,
        publicClient: mock.publicClient,
        account: A
      });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ScoplTransactionPlanError);
      expect((error as ScoplTransactionPlanError).completedTransactions).toHaveLength(1);
    }
    expect(mock.sendTransaction).toHaveBeenCalledTimes(2);
  });
});

describe("high-level createLimitOrder", () => {
  it("captures create-order hash and resolves identity through /receipt, never /orders", async () => {
    const paths: string[] = [];
    const fetch = vi.fn<ScoplFetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      paths.push(path);
      if (path.endsWith("/quote")) return jsonResponse(quoteFixture);
      if (path.endsWith("/config")) return jsonResponse(configFixture);
      if (path.endsWith("/receipt")) return jsonResponse(receiptFixture);
      throw new Error(`unexpected path ${path}`);
    });
    const client = new ScoplClient({ fetch });
    const mock = clients();
    const result = await createLimitOrder({
      client,
      request: {
        chainId: 4663,
        integrationId: ID,
        venueId: "uniswap-v3",
        pool: A,
        tokenIn: C,
        amountIn: "1000000000000000000",
        price: "1.25"
      },
      walletClient: mock.walletClient,
      publicClient: mock.publicClient,
      account: A
    });

    expect(result.creationHash).toBe(HASH);
    expect(result.order.orderId).toBe("42");
    expect(paths).toContain("/api/v2/limit-orders/receipt");
    expect(paths.some((path) => path.endsWith("/orders"))).toBe(false);
  });
});

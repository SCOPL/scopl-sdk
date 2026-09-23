import type { PublicClient, WalletClient } from "viem";

import type { ScoplClient } from "../client.js";
import { ScoplTransactionPlanError } from "../http/errors.js";
import type { QuoteRequest, QuoteResponse, ReceiptResponse } from "../limit-orders/types.js";
import type { Address, TransactionHash } from "../types.js";
import { validateQuoteTransactionPlan } from "../execution/validation.js";
import {
  executeTransactionPlan,
  type ExecutedTransaction
} from "./execute-plan.js";

export interface CreateLimitOrderOptions {
  client: ScoplClient;
  request: QuoteRequest;
  walletClient: Pick<WalletClient, "chain" | "sendTransaction">;
  publicClient: Pick<PublicClient, "call" | "waitForTransactionReceipt">;
  account: Address;
  signal?: AbortSignal;
  receiptTimeoutMs?: number;
}

export interface CreateLimitOrderResult {
  quote: QuoteResponse;
  transactions: ExecutedTransaction[];
  creationHash: TransactionHash;
  order: ReceiptResponse;
}

export async function createLimitOrder(
  options: CreateLimitOrderOptions
): Promise<CreateLimitOrderResult> {
  const request = { ...options.request, owner: options.request.owner ?? options.account };
  const quote = await options.client.limitOrders.quote({
    ...request,
    signal: options.signal ?? request.signal
  });
  await validateQuoteTransactionPlan({
    config: options.client.config,
    request,
    quote,
    account: options.account
  });
  if (!quote.ready) {
    throw new ScoplTransactionPlanError({
      message: `SCOPL quote is not ready: ${quote.warnings.join("; ") || "protocol unavailable"}.`
    });
  }
  const transactions = await executeTransactionPlan({
    steps: quote.transactions,
    chainId: request.chainId,
    walletClient: options.walletClient,
    publicClient: options.publicClient,
    account: options.account,
    signal: options.signal
  });
  const create = transactions.find((transaction) => transaction.step.kind === "create-order");
  if (!create) {
    throw new ScoplTransactionPlanError({
      message: "Executed quote did not contain a required create-order transaction.",
      completedTransactions: transactions
    });
  }
  const creationHash: TransactionHash = create.hash;
  const order = await options.client.limitOrders.waitForReceipt({
    chainId: request.chainId,
    transactionHash: creationHash,
    signal: options.signal,
    maxWaitMs: options.receiptTimeoutMs
  });
  return { quote, transactions, creationHash, order };
}

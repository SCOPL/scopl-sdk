import type { Hash, PublicClient, WalletClient } from "viem";

import {
  ScoplTransactionPlanError,
  type CompletedTransaction
} from "../http/errors.js";
import type { TransactionStep } from "../limit-orders/types.js";
import type { Address } from "../types.js";

const KNOWN_KINDS = new Set([
  "approve-token",
  "authorize-position-manager",
  "create-order"
]);

type CallClient = Pick<PublicClient, "call" | "waitForTransactionReceipt">;
type SendClient = Pick<WalletClient, "chain" | "sendTransaction">;

export interface ExecuteTransactionPlanOptions {
  steps: readonly TransactionStep[];
  chainId: number;
  walletClient: SendClient;
  publicClient: CallClient;
  account: Address;
  signal?: AbortSignal;
  /** Explicit validation hook for a future transaction kind. */
  validateUnknownStep?: (step: TransactionStep) => void | Promise<void>;
}

export interface ExecutedTransaction extends CompletedTransaction {
  receipt: Awaited<ReturnType<CallClient["waitForTransactionReceipt"]>>;
}

export async function executeTransactionPlan(
  options: ExecuteTransactionPlanOptions
): Promise<ExecutedTransaction[]> {
  if (options.walletClient.chain?.id !== options.chainId) {
    throw new ScoplTransactionPlanError({
      message: `Wallet is connected to chain ${options.walletClient.chain?.id ?? "unknown"}, expected ${options.chainId}.`
    });
  }
  const completed: ExecutedTransaction[] = [];
  for (const step of options.steps) {
    if (!step.required) continue;
    if (options.signal?.aborted) throw options.signal.reason;
    if (!KNOWN_KINDS.has(step.kind)) {
      if (!options.validateUnknownStep) {
        throw new ScoplTransactionPlanError({
          message: `Automatic execution refuses unknown transaction kind '${step.kind}'.`,
          completedTransactions: completed,
          failedStep: step
        });
      }
      await options.validateUnknownStep(step);
    }
    try {
      const value = BigInt(step.value);
      await options.publicClient.call({
        account: options.account,
        to: step.to,
        data: step.data,
        value
      });
      const send = options.walletClient.sendTransaction as unknown as (
        request: {
          account: Address;
          chain: SendClient["chain"];
          to: Address;
          data: `0x${string}`;
          value: bigint;
        }
      ) => Promise<Hash>;
      const hash = await send({
        account: options.account,
        chain: options.walletClient.chain,
        to: step.to,
        data: step.data,
        value
      });
      const receipt = await options.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error(`Transaction ${hash} reverted.`);
      }
      completed.push({ step, hash, receipt });
    } catch (cause) {
      throw new ScoplTransactionPlanError({
        message: `SCOPL transaction step '${step.kind}' failed; requote before retrying.`,
        completedTransactions: completed,
        failedStep: step,
        cause
      });
    }
  }
  return completed;
}

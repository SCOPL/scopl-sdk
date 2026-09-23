import { ScoplClient, type Address, type Bytes32 } from "@scopl/sdk";
import { createLimitOrder } from "@scopl/sdk/viem";
import type { PublicClient, WalletClient } from "viem";

export async function createOrderWithConnectedWallet(input: {
  walletClient: Pick<WalletClient, "chain" | "sendTransaction">;
  publicClient: Pick<PublicClient, "call" | "waitForTransactionReceipt">;
  account: Address;
  integrationId: Bytes32;
  pool: Address;
  tokenIn: Address;
}) {
  const client = new ScoplClient({ integrationId: input.integrationId });
  return createLimitOrder({
    client,
    walletClient: input.walletClient,
    publicClient: input.publicClient,
    account: input.account,
    request: {
      chainId: 4663,
      venueId: "uniswap-v3",
      pool: input.pool,
      tokenIn: input.tokenIn,
      amountIn: "1",
      price: "1.25"
    }
  });
}

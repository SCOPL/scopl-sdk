import {
  ScoplClient,
  type Address,
  type Bytes32
} from "@scopl/sdk";

const scopl = new ScoplClient();
const zeroAddress = "0x0000000000000000000000000000000000000000" satisfies Address;
const integrationId: Bytes32 = `0x${"ab".repeat(32)}`;
const poolId: Bytes32 = `0x${"cd".repeat(32)}`;

const quote = await scopl.limitOrders.quote({
  chainId: 4663,
  integrationId,
  venueId: "uniswap-v4",
  pool: poolId,
  tokenIn: zeroAddress,
  funding: "native",
  amountIn: "0.01",
  price: "1.25"
});

// Broadcast the returned value exactly; it includes the protocol-required native value.
console.log(quote.transactions);

import { ScoplClient, type Address, type Bytes32 } from "@scopl/sdk";

const scopl = new ScoplClient();
const integrationId: Bytes32 = `0x${"ab".repeat(32)}`;
const pool = "0x1111111111111111111111111111111111111111" satisfies Address;
const tokenIn = "0x2222222222222222222222222222222222222222" satisfies Address;

const validPrices = await scopl.limitOrders.prices({
  chainId: 4663,
  venueId: "ramses-v3",
  pool,
  tokenIn,
  count: 9
});
const quote = await scopl.limitOrders.quote({
  chainId: 4663,
  integrationId,
  venueId: "ramses-v3",
  pool,
  tokenIn,
  amountIn: "1000000000000000000",
  price: validPrices.options[0]?.executionPrice ?? "1"
});

console.log(quote.price, quote.transactions);

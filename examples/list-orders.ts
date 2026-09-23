import { ScoplClient, type Address } from "@scopl/sdk";

const scopl = new ScoplClient();
const owner = "0x1111111111111111111111111111111111111111" satisfies Address;
const orders = await scopl.limitOrders.list({
  chainId: 4663,
  owner,
  status: "open",
  page: 1,
  limit: 50
});

console.log(orders.data);

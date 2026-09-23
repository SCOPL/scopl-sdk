import { ScoplClient, type Address } from "@scopl/sdk";

const scopl = new ScoplClient();
const managerAddress = "0x1111111111111111111111111111111111111111" satisfies Address;

const plan = await scopl.limitOrders.buildManagementTransaction({
  chainId: 4663,
  managerAddress,
  action: "cancel",
  orderId: "42"
});

// The order owner's wallet must sign and broadcast this unsigned transaction.
console.log(plan.transaction);

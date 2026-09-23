import { ScoplClient, type Address, type Bytes32 } from "@scopl/sdk";

const scopl = new ScoplClient();
const owner = "0x1111111111111111111111111111111111111111" satisfies Address;
const registrationKey: Bytes32 = `0x${"ab".repeat(32)}`;

const plan = await scopl.integrations.buildRegistration({
  chainId: 4663,
  owner,
  registrationKey,
  feeRecipient: owner,
  userShareBps: 3_750
});

// The owner wallet must sign and broadcast this unsigned transaction.
console.log(plan.integrationId, plan.transaction);

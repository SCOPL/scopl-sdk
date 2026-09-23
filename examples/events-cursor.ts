import { ScoplClient, type Address } from "@scopl/sdk";

const scopl = new ScoplClient();
const owner = "0x1111111111111111111111111111111111111111" satisfies Address;
let savedCursor = "0";

for await (const page of scopl.limitOrders.iterateEvents({
  chainId: 4663,
  owner,
  after: savedCursor,
  poll: false
})) {
  for (const event of page.data) console.log(event.dedupeKey, event.event);
  // Commit only after the full page was processed successfully.
  savedCursor = page.nextLiveSeq;
}

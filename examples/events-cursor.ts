import { ScoplClient, type Address } from "@scopl/sdk";

const scopl = new ScoplClient();
const owner = "0x1111111111111111111111111111111111111111" satisfies Address;
const savedCursor = "0"; // Load this from the integration's durable storage.

function persistCursor(cursor: string): void {
  // Replace this example with an atomic durable write.
  console.log("Persist cursor", cursor);
}

for await (const page of scopl.limitOrders.iterateEvents({
  chainId: 4663,
  owner,
  after: savedCursor,
  poll: false
})) {
  for (const event of page.data) console.log(event.dedupeKey, event.event);
  // Commit only after the full page was processed successfully.
  persistCursor(page.nextLiveSeq);
}

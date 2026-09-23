import { ScoplClient } from "@scopl/sdk";

const scopl = new ScoplClient();
const pools = await scopl.pools.list({
  venueId: "ramses-v3",
  protocolVersion: 3
});

console.log(pools.data.map(({ pair, address, dexId }) => ({ pair, address, dexId })));

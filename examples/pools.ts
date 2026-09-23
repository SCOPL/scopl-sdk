import { ScoplClient } from "@scopl/sdk";

const scopl = new ScoplClient();
const pools = await scopl.pools.list({
  chainId: 4663,
  venueId: "ramses-v3",
  protocolVersion: 3,
  token: "0x1111111111111111111111111111111111111111",
  quoteToken: "0x2222222222222222222222222222222222222222"
});

console.log(pools.data.map(({ pair, address, dexId }) => ({ pair, address, dexId })));

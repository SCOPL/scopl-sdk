import { ScoplClient } from "@scopl/sdk";

const scopl = new ScoplClient();
const config = await scopl.config.get();

for (const chain of config.chains) {
  console.log(chain.id, chain.name, chain.venues.map((venue) => venue.venueId));
}

# @scopl/sdk

`@scopl/sdk` is the public TypeScript client for SCOPL's versioned V2 limit-order integration API. It discovers current deployments, builds unsigned integration and order transactions, resolves mined order identities, and synchronizes lifecycle events.

> **SCOPL API builds transactions. The user's wallet signs them. The SDK never owns user keys.**

The package is UI-free, works in modern browsers and Node.js 18+, and never accepts a private key in client configuration.

## Install

```bash
npm install @scopl/sdk
# Optional execution adapter:
npm install viem
```

## Create a read-only client

```ts
import { ScoplClient } from "@scopl/sdk";

const scopl = new ScoplClient(); // https://scopl.live
const config = await scopl.config.get();
```

Local, staging, API-only, and test deployments can supply `baseUrl`, `poolBaseUrl`, a custom `fetch`, an HTTP timeout below 30 seconds, and retry settings. The core SDK never reads application environment variables.

```ts
const local = new ScoplClient({
  baseUrl: "http://127.0.0.1:3000",
  timeoutMs: 20_000
});
```

Configuration is cached for five minutes by default. `scopl.config.refresh()` bypasses the cache. Writable manager and position-manager addresses always come from current runtime configuration; the SDK contains no authoritative hardcoded deployment addresses.

## Register an integration

Registration is chain-local even though the same owner and registration key derive the same logical integration ID across chains.

```ts
const plan = await scopl.integrations.buildRegistration({
  chainId: 4663,
  owner: "0x...",
  registrationKey: "0x...", // exactly 32 bytes
  feeRecipient: "0x...",
  userShareBps: 3_750 // 0..7500
});

// plan.transaction is unsigned. The integration owner signs and broadcasts it.
```

`buildUpdate()` similarly builds owner-only unsigned calldata. Neither HTTP call changes chain state. The SDK validates the returned destination against the current chain's order policy.

## Find pools

```ts
const result = await scopl.pools.list({
  venueId: "ramses-v3",
  protocolVersion: 3,
  token: "0x..."
});
```

Pool discovery is an indexed read model. The current directory does not publish a stable per-record `chainId`, so the SDK does not pretend it can safely chain-filter that response; chain selection remains explicit at quote time. Raw additive fields remain available, but analytics fields are intentionally not over-modeled. A pool record is never authorization to spend: current config and the quote API remain authoritative.

## Get valid prices

```ts
const prices = await scopl.limitOrders.prices({
  chainId: 4663,
  venueId: "uniswap-v3",
  pool: "0x...",
  tokenIn: "0x...",
  anchorPrice: "1.25",
  count: 9
});
```

All human amounts and prices are decimal strings. Raw uints, block numbers, token IDs, order IDs, and cursors remain decimal integer strings; the SDK never performs floating-point token arithmetic.

## Build a quote

```ts
const quote = await scopl.limitOrders.quote({
  chainId: 4663,
  integrationId: "0x...",
  venueId: "ramses-v3",
  pool: "0x...",
  tokenIn: "0x...",
  amountIn: "1000000000000000000",
  price: "1.25",
  owner: "0x...",
  funding: "erc20",
  slippageBps: 100,
  deadlineSeconds: 600
});
```

Integration economics are resolved by SCOPL registration. Quote requests cannot inject arbitrary recipients, referral attribution, or revenue shares.

### Requested versus executable price

Pool ticks may change the executable price. Always present or retain all returned fields:

```ts
quote.price.requestedPrice;
quote.price.executionPrice;
quote.price.adjustmentReason; // none | tick-rounding | market-boundary
quote.price.priceDifferenceBps;
```

A quote describes current state; it is not a guarantee of future execution.

## Execute a raw unsigned plan

`quote.transactions` is ordered. Process only `required: true` steps, in array order, never in parallel. Simulate and wait for each receipt before continuing. Broadcast the exact returned `value`; do not infer it or regenerate SCOPL calldata.

```ts
for (const step of quote.transactions) {
  if (!step.required) continue;
  // Host wallet flow: simulate -> user confirms/signs -> broadcast -> wait for receipt.
  // value at an EVM boundary is BigInt(step.value).
}
```

The raw client returns future transaction kinds for forward compatibility. Automatic execution must fail closed on unknown kinds unless the host explicitly validates them.

## High-level Viem flow

```ts
import { createLimitOrder } from "@scopl/sdk/viem";

const result = await createLimitOrder({
  client: scopl,
  walletClient,       // supplied by the host application
  publicClient,       // supplied by the host application
  account,
  request: {
    chainId: 4663,
    integrationId: "0x...",
    venueId: "uniswap-v3",
    pool: "0x...",
    tokenIn: "0x...",
    amountIn: "1000000000000000000",
    price: "1.25"
  }
});

console.log(result.creationHash, result.order.orderId);
```

The helper checks chain/account/config destinations, simulates each required step, submits sequentially, waits for receipts, captures the `create-order` hash, and resolves identity through `/receipt`. It never silently retries or resends a signed transaction. Nonce replacement remains the host wallet's responsibility.

## Resolve a created order

```ts
const once = await scopl.limitOrders.getReceipt({
  chainId: 4663,
  transactionHash
});

const confirmed = await scopl.limitOrders.waitForReceipt({
  chainId: 4663,
  transactionHash,
  maxWaitMs: 120_000,
  signal
});
```

`getReceipt()` makes one request and may return `status: "pending"`. `waitForReceipt()` follows HTTP 202 using `retryAfterMs`, then `Retry-After`, then a safe fallback. A confirmed receipt—not `nextOrderId` and not the indexed order list—is the immediate source of truth for `chainId + managerAddress + orderId`.

## List indexed orders

```ts
const orders = await scopl.limitOrders.list({
  chainId: 4663,
  owner: account,
  status: "open",
  venueId: "ramses-v3",
  page: 1,
  limit: 50
});
```

This is an eventually consistent indexed projection. It is for history and queries, not immediate post-creation identity.

## Consume lifecycle event cursors

```ts
for await (const page of scopl.limitOrders.iterateEvents({
  chainId: 4663,
  owner: account,
  after: savedCursor,
  signal
})) {
  await processInReturnedOrder(page.data);
  await saveCursor(page.nextLiveSeq); // commit only after the whole page succeeds
}
```

The host owns cursor persistence. `liveSeq` is a decimal string. If `hasMore` is true, the iterator fetches immediately; otherwise it waits for `pollAfterMs`. Deduplicate events using `event.dedupeKey`, which is `transactionHash + logIndex`. Set `poll: false` for a finite catch-up pass.

## Cancel or manage an order

```ts
const plan = await scopl.limitOrders.buildManagementTransaction({
  chainId: order.chainId,
  managerAddress: order.managerAddress, // exact manager stored on that order
  action: "cancel", // execute | mark-stale | increase-gas-reserve
  orderId: order.orderId
});
```

For `increase-gas-reserve`, provide `amountWei`. A numeric `orderId` is never enough to choose a manager, especially for legacy orders.

## Native funding

### V3 WETH pool

```ts
await scopl.limitOrders.quote({
  chainId,
  integrationId,
  venueId: "uniswap-v3", // or ramses-v3 when advertised by config
  pool: v3PoolAddress,
  tokenIn: wrappedNativeAddress,
  funding: "native",
  amountIn: "10000000000000000",
  price: "1.25"
});
```

The V3 create transaction can wrap ETH. Its exact returned `value` includes native input plus the gas reserve.

### V4 native ETH pool

```ts
await scopl.limitOrders.quote({
  chainId,
  integrationId,
  venueId: "uniswap-v4",
  pool: poolId, // bytes32
  tokenIn: "0x0000000000000000000000000000000000000000",
  funding: "native",
  amountIn: "10000000000000000",
  price: "1.25"
});
```

The zero address is canonical for the V4 native currency. Canonical WETH may be accepted as a direction alias, but that does not mean wallet WETH is unwrapped. When selling the ERC-20 side to receive native ETH, use that ERC-20 as `tokenIn` with `funding: "erc20"`; the SDK never approves the zero address.

## Ramses

Ramses is a first-class venue, not an alias for Uniswap V3:

```ts
const venue = await scopl.config.getVenue(chainId, "ramses-v3");
const quote = await scopl.limitOrders.quote({
  chainId,
  integrationId,
  venueId: venue.venueId,
  pool: ramsesPool,
  tokenIn,
  amountIn,
  price
});
```

Protocol version (`3` or `4`) and venue identity are separate concepts.

## Error handling

```ts
import { ScoplApiError, ScoplTimeoutError } from "@scopl/sdk";

try {
  await scopl.limitOrders.quote(request);
} catch (error) {
  if (error instanceof ScoplApiError && error.code === "INTEGRATION_NOT_REGISTERED") {
    // Build registration, have the owner broadcast it, then quote again.
  } else if (error instanceof ScoplTimeoutError) {
    // Host decides whether to retry.
  }
}
```

Available structured classes are `ScoplError`, `ScoplApiError`, `ScoplNetworkError`, `ScoplTimeoutError`, `ScoplValidationError`, `ScoplVersionError`, and `ScoplTransactionPlanError`. HTTP 400/422 are not automatically retried. Network failures and HTTP 503 use bounded exponential backoff with jitter. All long-running helpers accept `AbortSignal`.

## Multi-chain identity

Never key protocol objects by a numeric ID alone:

- Order: `chainId + managerAddress + orderId`
- Position: `chainId + positionManager + tokenId`
- Pool: `chainId + venueId + poolId`

Every chain-sensitive SDK request keeps `chainId` explicit.

## Receipt, events, and orders are different

- **Receipt:** immediate authoritative creation identity decoded from the mined create transaction.
- **Events:** durable incremental lifecycle synchronization controlled by the host cursor.
- **Orders:** eventually consistent indexed projection/history.

The high-level creation helper deliberately uses `/receipt`, never polling `/orders` for identity.

## Security model

- No private keys, seed phrases, custody, hidden signing, telemetry, or analytics.
- The configured SDK origin remains trusted even if remote metadata advertises a different absolute host.
- Transaction addresses, calldata, values, hashes, IDs, versions, and venue identity are runtime-validated.
- Current config is authoritative for writable managers; disabled or unknown venues fail closed.
- Required transaction steps stay ordered and unknown automatic-execution steps fail closed.
- Wallet chain and intended owner are checked before execution.
- API quotes and indexed pool/order state can change; simulate against current state before signing.
- Direct referral binding and SCOPL-internal protocol revenue allocation are intentionally outside SDK V1.

See the runnable, placeholder-only TypeScript programs in [`examples/`](./examples/).

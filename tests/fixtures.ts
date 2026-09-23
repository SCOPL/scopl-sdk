import type { ScoplFetch } from "../src/http/transport.js";

export const A = "0x1111111111111111111111111111111111111111" as const;
export const B = "0x2222222222222222222222222222222222222222" as const;
export const C = "0x3333333333333333333333333333333333333333" as const;
export const D = "0x4444444444444444444444444444444444444444" as const;
export const ZERO = "0x0000000000000000000000000000000000000000" as const;
export const ID = `0x${"a".repeat(64)}` as `0x${string}`;
export const HASH = `0x${"b".repeat(64)}` as `0x${string}`;
export const POOL_ID = `0x${"c".repeat(64)}` as `0x${string}`;

export const configFixture = {
  apiVersion: "2.0.0",
  chains: [{
    id: 4663,
    slug: "robinhood",
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: "https://rpc.example",
    explorerUrl: "https://explorer.example",
    canonicalScoplChain: true,
    orderPolicy: D,
    revenueCollector: null,
    wrappedNativeAddress: C,
    v3: {
      manager: A,
      positionManager: B,
      factory: D,
      feeTiers: [100, 500, 3000, 10000],
      enabled: true
    },
    v4: {
      manager: D,
      positionManager: B,
      poolManager: A,
      stateView: C,
      enabled: true
    },
    venues: [
      {
        venueId: "uniswap-v3",
        protocolVersion: 3,
        manager: A,
        positionManager: B,
        contractVersion: 3
      },
      {
        venueId: "ramses-v3",
        protocolVersion: 3,
        manager: C,
        positionManager: D,
        contractVersion: 3
      },
      {
        venueId: "uniswap-v4",
        protocolVersion: 4,
        manager: D,
        positionManager: B,
        contractVersion: 3
      }
    ]
  }],
  protocol: {
    version: 2,
    economics: { integration: {}, direct: {} },
    nativeCurrencyAddress: ZERO,
    v3ManagerAbi: [],
    v4ManagerAbi: []
  },
  endpoints: {
    quote: "https://localhost:8790/api/v2/limit-orders/quote",
    prices: "https://localhost:8790/api/v2/limit-orders/prices",
    receipt: "https://localhost:8790/api/v2/limit-orders/receipt",
    orders: "https://localhost:8790/api/v2/limit-orders/orders",
    events: "https://localhost:8790/api/v2/limit-orders/events",
    manage: "https://localhost:8790/api/v2/limit-orders/manage",
    registerIntegration: "https://localhost:8790/api/v2/integrations/register",
    updateIntegration: "https://localhost:8790/api/v2/integrations/update",
    poolDirectory: "https://localhost:8790/api/indexer/pools",
    openapi: "https://localhost:8790/api/v2/openapi.json"
  }
} as const;

export const quoteFixture = {
  apiVersion: "2.0.0",
  chainId: 4663,
  ready: true,
  warnings: [],
  price: {
    requestedPrice: "1.2345",
    executionPrice: "1.2344",
    adjustmentReason: "tick-rounding",
    priceDifferenceBps: 0.81
  },
  protocol: {
    manager: A,
    positionManager: B,
    gasReserveWei: "150000000000000"
  },
  transactions: [
    {
      kind: "approve-token",
      to: C,
      data: "0x12",
      value: "0",
      required: false,
      description: "Approve token"
    },
    {
      kind: "create-order",
      to: A,
      data: "0x34",
      value: "150000000000000",
      required: true,
      description: "Create order",
      result: {
        endpoint: "/api/v2/limit-orders/receipt",
        queryParameters: ["chainId", "transactionHash"],
        chainId: 4663,
        event: "OrderCreated",
        fields: ["orderId", "tokenId", "protocolVersion"]
      }
    }
  ]
} as const;

export const receiptFixture = {
  apiVersion: "2.0.0",
  chainId: 4663,
  status: "confirmed",
  transactionHash: HASH,
  blockNumber: "70000000",
  orderId: "42",
  tokenId: "90071992547409930000",
  protocolVersion: 3,
  venueId: "uniswap-v3",
  positionManager: B,
  managerAddress: A,
  owner: A,
  poolId: null,
  tokenIn: C,
  tokenOut: D,
  amountIn: "1000000000000000000",
  tickLower: 10,
  tickUpper: 20,
  gasReserveWei: "150000000000000",
  indexedOrderUrl: `https://scopl.live/api/v2/limit-orders/orders?chainId=4663&createdTxHash=${HASH}`
} as const;

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "X-SCOPL-API-Version": "2.0.0",
      ...headers
    }
  });
}

export function fetchSequence(...responses: Array<Response | Error>): {
  fetch: ScoplFetch;
  calls: URL[];
} {
  const calls: URL[] = [];
  let index = 0;
  return {
    calls,
    fetch: (async (input: RequestInfo | URL) => {
      calls.push(new URL(String(input)));
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (response instanceof Error) throw response;
      return response;
    }) as ScoplFetch
  };
}

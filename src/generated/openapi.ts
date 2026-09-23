/**
 * Checked-in type snapshot derived from the SCOPL OpenAPI 3.1 document.
 * It is intentionally not the public SDK surface; domain clients add stronger
 * response types and runtime validation around these request schemas.
 */
export interface paths {
  "/api/indexer/pools": { get: { responses: { 200: unknown } } };
  "/api/v2/limit-orders/config": { get: { responses: { 200: unknown } } };
  "/api/v2/limit-orders/prices": {
    post: { requestBody: { content: { "application/json": components["schemas"]["PricesRequest"] } } };
  };
  "/api/v2/limit-orders/quote": {
    post: { requestBody: { content: { "application/json": components["schemas"]["QuoteRequest"] } } };
  };
  "/api/v2/limit-orders/receipt": { get: { responses: { 200: unknown; 202: unknown } } };
  "/api/v2/limit-orders/orders": { get: { responses: { 200: unknown } } };
  "/api/v2/limit-orders/events": { get: { responses: { 200: unknown } } };
  "/api/v2/limit-orders/manage": {
    post: { requestBody: { content: { "application/json": components["schemas"]["ManageRequest"] } } };
  };
  "/api/v2/integrations/register": {
    post: {
      requestBody: {
        content: {
          "application/json": components["schemas"]["RegisterIntegrationRequest"];
        };
      };
    };
  };
  "/api/v2/integrations/update": {
    post: {
      requestBody: {
        content: {
          "application/json": components["schemas"]["UpdateIntegrationRequest"];
        };
      };
    };
  };
}

export interface components {
  schemas: {
    VenueId: "uniswap-v3" | "ramses-v3" | "uniswap-v4";
    PoolDirectoryQuery: {
      chainId?: number;
      venueId?: components["schemas"]["VenueId"];
      token?: string;
      quoteToken?: string;
      protocolVersion?: 3 | 4;
    };
    PricesRequest: {
      chainId: number;
      venueId?: components["schemas"]["VenueId"];
      pool: string;
      tokenIn: string;
      anchorPrice?: string;
      count?: number;
    };
    QuoteRequest: {
      chainId: number;
      integrationId: string;
      venueId?: components["schemas"]["VenueId"];
      pool: string;
      tokenIn: string;
      amountIn: string;
      price: string;
      owner?: string;
      funding?: "erc20" | "native";
      slippageBps?: number;
      deadlineSeconds?: number;
      priceOptionCount?: number;
    };
    ManageRequest: {
      chainId: number;
      managerAddress: string;
      action: "cancel" | "execute" | "mark-stale" | "increase-gas-reserve";
      orderId: string;
      amountWei?: string;
    };
    RegisterIntegrationRequest: {
      chainId: number;
      owner: string;
      registrationKey: string;
      feeRecipient: string;
      userShareBps: number;
    };
    UpdateIntegrationRequest: {
      chainId: number;
      integrationId: string;
      feeRecipient: string;
      userShareBps: number;
    };
  };
}

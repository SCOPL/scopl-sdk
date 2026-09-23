import type {
  Address,
  Bytes32,
  FundingMode,
  Hex,
  ProtocolVersion,
  RequestOptions,
  TransactionHash,
  VenueId
} from "../types.js";

export interface PriceOptionsRequest extends RequestOptions {
  chainId: number;
  venueId?: VenueId;
  pool: Address | Bytes32;
  tokenIn: Address;
  anchorPrice?: string;
  count?: number;
}

export interface PriceOption {
  tickLower: number;
  tickUpper: number;
  executionPrice: string;
  fullFillPrice?: string;
  rangeLow?: string;
  rangeHigh?: string;
}

export interface PriceOptionsResponse {
  [key: string]: unknown;
  apiVersion: string;
  chainId: number;
  currentTick: number;
  options: PriceOption[];
  totalPossible: string | number;
}

export interface QuoteRequest extends RequestOptions {
  chainId: number;
  integrationId: Bytes32;
  venueId?: VenueId;
  pool: Address | Bytes32;
  tokenIn: Address;
  /** Human token amount, for example "1" or "0.1"; never base units/wei. */
  amountIn: string;
  price: string;
  owner?: Address;
  funding?: FundingMode;
  slippageBps?: number;
  deadlineSeconds?: number;
  priceOptionCount?: number;
}

export interface TransactionStep {
  kind: string;
  to: Address;
  data: Hex;
  value: string;
  required: boolean;
  description: string;
  result?: {
    endpoint: string;
    queryParameters: string[];
    chainId?: number;
    event: string;
    fields: string[];
  };
}

export type PriceAdjustmentReason = "none" | "tick-rounding" | "market-boundary";

export interface QuotePrice {
  requestedPrice: string;
  executionPrice: string;
  adjustmentReason: PriceAdjustmentReason;
  priceDifferenceBps: number;
  [key: string]: unknown;
}

export interface QuoteResponse {
  [key: string]: unknown;
  apiVersion: string;
  chainId: number;
  ready: boolean;
  warnings: string[];
  price: QuotePrice;
  transactions: TransactionStep[];
  protocol: {
    manager: Address;
    positionManager: Address;
    gasReserveWei: string;
    [key: string]: unknown;
  };
}

export interface ReceiptRequest extends RequestOptions {
  chainId: number;
  transactionHash: TransactionHash;
}

export interface PendingReceiptResponse {
  apiVersion: string;
  chainId: number;
  status: "pending";
  transactionHash: TransactionHash;
  retryAfterMs: number;
}

export interface ReceiptResponse {
  apiVersion: string;
  chainId: number;
  status: "confirmed";
  transactionHash: TransactionHash;
  blockNumber: string;
  orderId: string;
  tokenId: string;
  protocolVersion: ProtocolVersion;
  venueId: VenueId;
  positionManager: Address;
  managerAddress: Address;
  owner: Address;
  poolId: Bytes32 | null;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  tickLower: number;
  tickUpper: number;
  gasReserveWei: string;
  indexedOrderUrl: string;
}

export type ReceiptResult = PendingReceiptResponse | ReceiptResponse;

export interface WaitForReceiptOptions extends ReceiptRequest {
  timeoutMs?: number;
  maxWaitMs?: number;
}

export type IndexedOrderStatus = "open" | "filled" | "cancelled" | "stale";

export interface ListOrdersRequest extends RequestOptions {
  chainId: number;
  owner?: Address;
  status?: IndexedOrderStatus | "all";
  version?: ProtocolVersion;
  venueId?: VenueId;
  poolAddress?: Address | Bytes32;
  createdTxHash?: TransactionHash;
  page?: number;
  limit?: number;
}

export interface ScoplOrder {
  [key: string]: unknown;
  orderKey: string;
  chainId: number;
  managerAddress: Address;
  venueId: VenueId;
  positionManager?: Address;
  protocolVersion: ProtocolVersion;
  contractVersion: number;
  orderId: string;
  owner: Address;
  tokenId: string;
  tokenIn: Address;
  tokenOut: Address;
  poolAddress: Address | Bytes32 | null;
  poolId?: Bytes32 | null;
  status: IndexedOrderStatus;
  createdBlock: string;
  updatedBlock: string;
  createdTxHash: TransactionHash;
}

export interface ListOrdersResponse {
  data: ScoplOrder[];
  source: "scopl-indexer";
  page: number;
  limit: number;
  total: number;
  updatedAt: string;
}

export interface OwnerEventsRequest extends RequestOptions {
  chainId: number;
  owner: Address;
  after?: string;
  limit?: number;
}

export interface OwnerEvent {
  liveSeq: string;
  protocolVersion: ProtocolVersion;
  venueId: VenueId;
  positionManager: Address;
  managerAddress: Address;
  orderId: string | null;
  event: string;
  blockNumber: string;
  transactionHash: TransactionHash;
  transactionIndex: number;
  logIndex: number;
  payload: Record<string, unknown>;
  indexedAt: string;
  /** Stable host-side dedupe identity. */
  dedupeKey: string;
}

export interface OwnerEventsResponse {
  apiVersion: string;
  chainId: number;
  owner: Address;
  data: OwnerEvent[];
  nextLiveSeq: string;
  hasMore: boolean;
  pollAfterMs: number;
}

export interface IterateEventsRequest extends OwnerEventsRequest {
  poll?: boolean;
}

export type ManageAction = "cancel" | "execute" | "mark-stale" | "increase-gas-reserve";

export interface ManageRequest extends RequestOptions {
  chainId: number;
  managerAddress: Address;
  action: ManageAction;
  orderId: string;
  amountWei?: string;
}

export interface UnsignedTransaction {
  kind?: string;
  to: Address;
  data: Hex;
  value: string;
}

export interface ManageResponse {
  apiVersion: string;
  chainId: number;
  contractVersion: number;
  protocolVersion: ProtocolVersion;
  venueId: VenueId;
  positionManager: Address;
  orderId: string;
  transaction: UnsignedTransaction;
}

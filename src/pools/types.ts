import type { Address, Hex, ProtocolVersion, RequestOptions, VenueId } from "../types.js";

export interface PoolRecord {
  [key: string]: unknown;
  venueId?: VenueId;
  address: Hex;
  pair: string;
  baseTokenAddress: Address;
  quoteTokenAddress: Address;
  dexId: string;
  version: "v3" | "v4" | "unknown";
  supported: boolean;
  feePercent?: number | null;
  tvlUsd?: number | null;
  volume24hUsd?: number | null;
}

export interface PoolsResponse {
  data: PoolRecord[];
  source: "scopl-indexer";
  chainId: number;
  blockNumber?: string;
  updatedAt: string;
  page: number;
  limit: number;
  total: number;
  enrichment?: { stale: boolean; updatedAt: string | null };
}

export interface PoolFilters extends RequestOptions {
  /** Destination chain. Defaults to the canonical Robinhood Chain deployment (4663). */
  chainId?: number;
  /** Omit to include every enabled venue. */
  venueId?: VenueId;
  /** Require this token on either side of the pool. */
  token?: Address;
  /** Optionally require a counter token. Address zero requests the native equivalent. */
  quoteToken?: Address;
  protocolVersion?: ProtocolVersion;
}

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
  blockNumber?: string;
  updatedAt: string;
  page: number;
  limit: number;
  total: number;
  enrichment?: { stale: boolean; updatedAt: string | null };
}

export interface PoolFilters extends RequestOptions {
  venueId?: VenueId;
  token?: Address;
  protocolVersion?: ProtocolVersion;
}

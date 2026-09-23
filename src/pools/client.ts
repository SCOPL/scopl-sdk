import type { ScoplTransport } from "../http/transport.js";
import { ScoplValidationError } from "../http/errors.js";
import type { VenueId } from "../types.js";
import {
  address,
  array,
  boolean,
  decimalInteger,
  integer,
  record,
  string
} from "../utils/validation.js";
import type { PoolFilters, PoolRecord, PoolsResponse } from "./types.js";

function inferredVenue(pool: PoolRecord): VenueId | undefined {
  if (pool.venueId) return pool.venueId;
  const dex = pool.dexId.toLowerCase();
  if (dex.includes("ramses") && pool.version === "v3") return "ramses-v3";
  if (dex.includes("uniswap") && pool.version === "v3") return "uniswap-v3";
  if (dex.includes("uniswap") && pool.version === "v4") return "uniswap-v4";
  return undefined;
}

function parsePool(value: unknown, path: string): PoolRecord {
  const pool = record(value, path);
  const version = string(pool.version, `${path}.version`);
  if (version !== "v3" && version !== "v4" && version !== "unknown") {
    throw new ScoplValidationError("Pool version is unsupported.", `${path}.version`);
  }
  return {
    ...pool,
    address: string(pool.address, `${path}.address`) as `0x${string}`,
    pair: string(pool.pair, `${path}.pair`),
    baseTokenAddress: address(pool.baseTokenAddress, `${path}.baseTokenAddress`),
    quoteTokenAddress: address(pool.quoteTokenAddress, `${path}.quoteTokenAddress`),
    dexId: string(pool.dexId, `${path}.dexId`),
    version,
    supported: boolean(pool.supported, `${path}.supported`)
  };
}

function parsePools(value: unknown): PoolsResponse {
  const root = record(value, "pools");
  if (root.source !== "scopl-indexer") {
    throw new ScoplValidationError("Unexpected pool directory source.", "pools.source");
  }
  return {
    data: array(root.data, "pools.data").map((entry, index) =>
      parsePool(entry, `pools.data[${index}]`)
    ),
    source: "scopl-indexer",
    ...(root.blockNumber === undefined
      ? {}
      : { blockNumber: decimalInteger(root.blockNumber, "pools.blockNumber") }),
    updatedAt: string(root.updatedAt, "pools.updatedAt"),
    page: integer(root.page, "pools.page"),
    limit: integer(root.limit, "pools.limit"),
    total: integer(root.total, "pools.total"),
    ...(root.enrichment && typeof root.enrichment === "object"
      ? { enrichment: root.enrichment as PoolsResponse["enrichment"] }
      : {})
  };
}

export function filterPools(pools: readonly PoolRecord[], filters: PoolFilters): PoolRecord[] {
  const token = filters.token?.toLowerCase();
  return pools.filter((pool) => {
    if (filters.protocolVersion !== undefined && pool.version !== `v${filters.protocolVersion}`) {
      return false;
    }
    if (filters.venueId !== undefined && inferredVenue(pool) !== filters.venueId) return false;
    if (token && pool.baseTokenAddress.toLowerCase() !== token &&
        pool.quoteTokenAddress.toLowerCase() !== token) return false;
    return true;
  });
}

export class PoolsClient {
  constructor(private readonly transport: ScoplTransport) {}

  async list(filters: PoolFilters = {}): Promise<PoolsResponse> {
    const response = await this.transport.json(
      "/api/indexer/pools",
      { signal: filters.signal },
      parsePools
    );
    const filtered = filterPools(response.data.data, filters);
    return filters.venueId === undefined && filters.token === undefined &&
      filters.protocolVersion === undefined
      ? response.data
      : { ...response.data, data: filtered, total: filtered.length };
  }
}

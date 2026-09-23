import type { Address, VenueId } from "../types.js";

export interface NativeCurrencyConfig {
  name: string;
  symbol: string;
  decimals: number;
}

export interface VenueConfig {
  venueId: VenueId;
  protocolVersion: 3 | 4;
  manager: Address;
  positionManager: Address;
  contractVersion: number;
  enabled?: boolean;
}

export interface ChainConfig {
  id: number;
  slug: string;
  name: string;
  nativeCurrency: NativeCurrencyConfig;
  rpcUrl: string;
  explorerUrl: string;
  canonicalScoplChain: boolean;
  orderPolicy: Address | null;
  revenueCollector: Address | null;
  wrappedNativeAddress: Address;
  v3: {
    manager: Address | null;
    positionManager: Address;
    factory: Address;
    feeTiers: number[];
    enabled: boolean;
  };
  v4: {
    manager: Address | null;
    positionManager: Address;
    poolManager: Address;
    stateView: Address;
    enabled: boolean;
  };
  venues: VenueConfig[];
}

export interface ConfigEndpoints {
  quote: string;
  prices: string;
  receipt: string;
  orders: string;
  events: string;
  manage: string;
  registerIntegration: string;
  updateIntegration: string;
  poolDirectory: string;
  openapi: string;
}

export interface ScoplConfig {
  apiVersion: string;
  chains: ChainConfig[];
  protocol: {
    version: number;
    economics: {
      integration: Record<string, unknown>;
      direct: Record<string, unknown>;
    };
    nativeCurrencyAddress: Address;
    v3ManagerAbi: unknown[];
    v4ManagerAbi: unknown[];
  };
  /** Endpoint paths are pinned to the ScoplClient's configured trusted origin. */
  endpoints: ConfigEndpoints;
}

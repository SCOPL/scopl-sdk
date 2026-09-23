import type { ScoplTransport } from "../http/transport.js";
import { ScoplValidationError } from "../http/errors.js";
import {
  address,
  array,
  boolean,
  finiteNumber,
  integer,
  nullableAddress,
  record,
  string,
  venueId
} from "../utils/validation.js";
import type {
  ChainConfig,
  ConfigEndpoints,
  ScoplConfig,
  VenueConfig
} from "./types.js";

function parseVenue(value: unknown, path: string): VenueConfig {
  const item = record(value, path);
  const protocolVersion = integer(item.protocolVersion, `${path}.protocolVersion`);
  if (protocolVersion !== 3 && protocolVersion !== 4) {
    throw new ScoplValidationError("Protocol version must be 3 or 4.", `${path}.protocolVersion`);
  }
  return {
    venueId: venueId(item.venueId, `${path}.venueId`),
    protocolVersion,
    manager: address(item.manager, `${path}.manager`),
    positionManager: address(item.positionManager, `${path}.positionManager`),
    contractVersion: integer(item.contractVersion, `${path}.contractVersion`),
    ...(item.enabled === undefined
      ? {}
      : { enabled: boolean(item.enabled, `${path}.enabled`) })
  };
}

function parseChain(value: unknown, path: string): ChainConfig {
  const item = record(value, path);
  const native = record(item.nativeCurrency, `${path}.nativeCurrency`);
  const v3 = record(item.v3, `${path}.v3`);
  const v4 = record(item.v4, `${path}.v4`);
  return {
    id: integer(item.id, `${path}.id`),
    slug: string(item.slug, `${path}.slug`),
    name: string(item.name, `${path}.name`),
    nativeCurrency: {
      name: string(native.name, `${path}.nativeCurrency.name`),
      symbol: string(native.symbol, `${path}.nativeCurrency.symbol`),
      decimals: integer(native.decimals, `${path}.nativeCurrency.decimals`)
    },
    rpcUrl: string(item.rpcUrl, `${path}.rpcUrl`),
    explorerUrl: string(item.explorerUrl, `${path}.explorerUrl`),
    canonicalScoplChain: boolean(
      item.canonicalScoplChain,
      `${path}.canonicalScoplChain`
    ),
    orderPolicy: nullableAddress(item.orderPolicy, `${path}.orderPolicy`),
    revenueCollector: nullableAddress(item.revenueCollector, `${path}.revenueCollector`),
    wrappedNativeAddress: address(item.wrappedNativeAddress, `${path}.wrappedNativeAddress`),
    v3: {
      manager: nullableAddress(v3.manager, `${path}.v3.manager`),
      positionManager: address(v3.positionManager, `${path}.v3.positionManager`),
      factory: address(v3.factory, `${path}.v3.factory`),
      feeTiers: array(v3.feeTiers, `${path}.v3.feeTiers`).map((entry, index) =>
        integer(entry, `${path}.v3.feeTiers[${index}]`)
      ),
      enabled: boolean(v3.enabled, `${path}.v3.enabled`)
    },
    v4: {
      manager: nullableAddress(v4.manager, `${path}.v4.manager`),
      positionManager: address(v4.positionManager, `${path}.v4.positionManager`),
      poolManager: address(v4.poolManager, `${path}.v4.poolManager`),
      stateView: address(v4.stateView, `${path}.v4.stateView`),
      enabled: boolean(v4.enabled, `${path}.v4.enabled`)
    },
    venues: array(item.venues, `${path}.venues`).map((entry, index) =>
      parseVenue(entry, `${path}.venues[${index}]`)
    )
  };
}

function trustedEndpoint(
  value: unknown,
  path: string,
  transport: ScoplTransport
): string {
  const advertised = new URL(string(value, path), transport.baseUrl);
  return transport.url(`${advertised.pathname}${advertised.search}`).toString();
}

function parseEndpoints(
  value: unknown,
  transport: ScoplTransport
): ConfigEndpoints {
  const endpoints = record(value, "config.endpoints");
  const names = [
    "quote",
    "prices",
    "receipt",
    "orders",
    "events",
    "manage",
    "registerIntegration",
    "updateIntegration",
    "poolDirectory",
    "openapi"
  ] as const;
  return Object.fromEntries(names.map((name) => [
    name,
    trustedEndpoint(endpoints[name], `config.endpoints.${name}`, transport)
  ])) as unknown as ConfigEndpoints;
}

export function parseConfig(value: unknown, transport: ScoplTransport): ScoplConfig {
  const root = record(value, "config");
  const protocol = record(root.protocol, "config.protocol");
  const economics = record(protocol.economics, "config.protocol.economics");
  const integration = record(economics.integration, "config.protocol.economics.integration");
  const direct = record(economics.direct, "config.protocol.economics.direct");
  return {
    apiVersion: string(root.apiVersion, "config.apiVersion"),
    chains: array(root.chains, "config.chains").map((entry, index) =>
      parseChain(entry, `config.chains[${index}]`)
    ),
    protocol: {
      version: finiteNumber(protocol.version, "config.protocol.version"),
      economics: { integration, direct },
      nativeCurrencyAddress: address(
        protocol.nativeCurrencyAddress,
        "config.protocol.nativeCurrencyAddress"
      ),
      v3ManagerAbi: array(protocol.v3ManagerAbi, "config.protocol.v3ManagerAbi"),
      v4ManagerAbi: array(protocol.v4ManagerAbi, "config.protocol.v4ManagerAbi")
    },
    endpoints: parseEndpoints(root.endpoints, transport)
  };
}

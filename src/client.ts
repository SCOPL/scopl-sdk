import { ConfigClient } from "./config/client.js";
import { ScoplTransport, type ScoplFetch } from "./http/transport.js";
import { IntegrationsClient } from "./integrations/client.js";
import { LimitOrdersClient } from "./limit-orders/client.js";
import { PoolsClient } from "./pools/client.js";
import type { Bytes32 } from "./types.js";

export const SCOPL_PRODUCTION_API_URL = "https://scopl.live";

export interface ScoplClientOptions {
  baseUrl?: string;
  poolBaseUrl?: string;
  /** Default integration identity injected into quote requests. */
  integrationId?: Bytes32;
  fetch?: ScoplFetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  configCacheMs?: number;
}

export class ScoplClient {
  readonly config: ConfigClient;
  readonly pools: PoolsClient;
  readonly limitOrders: LimitOrdersClient;
  readonly integrations: IntegrationsClient;
  readonly baseUrl: string;
  readonly poolBaseUrl: string;
  readonly integrationId?: Bytes32;
  private readonly transport: ScoplTransport;

  constructor(options: ScoplClientOptions = {}) {
    const shared = {
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      retryBaseDelayMs: options.retryBaseDelayMs
    };
    this.transport = new ScoplTransport({
      ...shared,
      baseUrl: options.baseUrl ?? SCOPL_PRODUCTION_API_URL
    });
    const poolTransport = options.poolBaseUrl &&
      options.poolBaseUrl.replace(/\/+$/, "") !== this.transport.baseUrl
      ? new ScoplTransport({ ...shared, baseUrl: options.poolBaseUrl })
      : this.transport;
    this.baseUrl = this.transport.baseUrl;
    this.poolBaseUrl = poolTransport.baseUrl;
    this.integrationId = options.integrationId;
    this.config = new ConfigClient(this.transport, options.configCacheMs);
    this.pools = new PoolsClient(poolTransport);
    this.limitOrders = new LimitOrdersClient(this.transport, options.integrationId);
    this.integrations = new IntegrationsClient(this.transport, this.config);
  }

  get apiVersion(): string | null {
    return this.transport.apiVersion;
  }
}

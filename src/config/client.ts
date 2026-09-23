import { ScoplValidationError } from "../http/errors.js";
import type { ScoplTransport } from "../http/transport.js";
import type { RequestOptions, VenueId } from "../types.js";
import type { ChainConfig, ScoplConfig, VenueConfig } from "./types.js";
import { parseConfig } from "./validation.js";

export interface ConfigGetOptions extends RequestOptions {
  forceRefresh?: boolean;
}

export class ConfigClient {
  private cached: { value: ScoplConfig; expiresAt: number } | null = null;

  constructor(
    private readonly transport: ScoplTransport,
    private readonly cacheMs = 300_000
  ) {}

  async get(options: ConfigGetOptions = {}): Promise<ScoplConfig> {
    if (!options.forceRefresh && this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.value;
    }
    const response = await this.transport.json(
      "/api/v2/limit-orders/config",
      { signal: options.signal },
      (value) => parseConfig(value, this.transport)
    );
    this.cached = { value: response.data, expiresAt: Date.now() + this.cacheMs };
    return response.data;
  }

  refresh(options: RequestOptions = {}): Promise<ScoplConfig> {
    return this.get({ ...options, forceRefresh: true });
  }

  async getChain(chainId: number, options: ConfigGetOptions = {}): Promise<ChainConfig> {
    const config = await this.get(options);
    const chain = config.chains.find((candidate) => candidate.id === chainId);
    if (!chain) throw new ScoplValidationError(`SCOPL is not enabled on chain ${chainId}.`);
    return chain;
  }

  async getVenue(
    chainId: number,
    venue: VenueId,
    options: ConfigGetOptions = {}
  ): Promise<VenueConfig> {
    const chain = await this.getChain(chainId, options);
    const result = chain.venues.find((candidate) => candidate.venueId === venue);
    if (!result || result.enabled === false) {
      throw new ScoplValidationError(`${venue} is not enabled on chain ${chainId}.`);
    }
    return result;
  }
}

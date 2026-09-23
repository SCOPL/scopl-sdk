import type { ConfigClient } from "../config/client.js";
import { ScoplTransactionPlanError } from "../http/errors.js";
import type { QuoteRequest, QuoteResponse, TransactionStep } from "../limit-orders/types.js";
import type { VenueId } from "../types.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const KNOWN_QUOTE_STEPS = new Set([
  "approve-token",
  "authorize-position-manager",
  "create-order"
]);

function requestedVenue(request: QuoteRequest): VenueId {
  if (request.venueId) return request.venueId;
  return request.pool.length === 66 ? "uniswap-v4" : "uniswap-v3";
}

function fail(message: string, step?: TransactionStep): never {
  throw new ScoplTransactionPlanError({ message, failedStep: step });
}

export async function validateQuoteTransactionPlan(input: {
  config: ConfigClient;
  request: QuoteRequest;
  quote: QuoteResponse;
  account?: string;
}): Promise<void> {
  const { request, quote } = input;
  if (quote.chainId !== request.chainId) fail("Quote chain does not match the request chain.");
  if (request.owner && input.account && request.owner.toLowerCase() !== input.account.toLowerCase()) {
    fail("Connected account does not match the requested order owner.");
  }
  const venue = await input.config.getVenue(request.chainId, requestedVenue(request), {
    signal: request.signal
  });
  if (quote.protocol.manager.toLowerCase() !== venue.manager.toLowerCase()) {
    fail("Quote manager does not match the current chain and venue configuration.");
  }
  if (quote.protocol.positionManager.toLowerCase() !== venue.positionManager.toLowerCase()) {
    fail("Quote position manager does not match current configuration.");
  }

  let createSteps = 0;
  for (const step of quote.transactions) {
    if (!step.required) continue;
    if (!KNOWN_QUOTE_STEPS.has(step.kind)) {
      fail(`Automatic execution refuses unknown transaction kind '${step.kind}'.`, step);
    }
    if (step.kind === "create-order") {
      createSteps += 1;
      if (step.to.toLowerCase() !== venue.manager.toLowerCase()) {
        fail("Create-order step does not target the configured venue manager.", step);
      }
    } else if (step.kind === "authorize-position-manager") {
      if (step.to.toLowerCase() !== venue.positionManager.toLowerCase()) {
        fail("Position authorization does not target the configured position manager.", step);
      }
    } else if (step.kind === "approve-token") {
      if (step.to.toLowerCase() === ZERO_ADDRESS) {
        fail("ERC-20 approval cannot target the native-currency zero address.", step);
      }
      if (step.to.toLowerCase() !== request.tokenIn.toLowerCase()) {
        fail("Token approval does not target the requested input token.", step);
      }
    }
  }
  if (createSteps !== 1) fail("A quote must contain exactly one required create-order step.");

  if (request.funding === "native") {
    const inputToken = request.tokenIn.toLowerCase();
    if (venue.venueId === "uniswap-v4") {
      const chain = await input.config.getChain(request.chainId, { signal: request.signal });
      if (inputToken !== ZERO_ADDRESS && inputToken !== chain.wrappedNativeAddress.toLowerCase()) {
        fail("V4 native funding requires the zero-address currency or canonical WETH alias.");
      }
    } else {
      const chain = await input.config.getChain(request.chainId, { signal: request.signal });
      if (inputToken !== chain.wrappedNativeAddress.toLowerCase()) {
        fail("V3 native funding requires WETH as the sold pool currency.");
      }
    }
  }
}

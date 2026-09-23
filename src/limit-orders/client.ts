import {
  ScoplTimeoutError,
  ScoplTransactionPlanError,
  ScoplValidationError
} from "../http/errors.js";
import type { ScoplTransport } from "../http/transport.js";
import { sleep } from "../utils/sleep.js";
import type {
  IterateEventsRequest,
  ListOrdersRequest,
  ListOrdersResponse,
  ManageRequest,
  ManageResponse,
  OwnerEventsRequest,
  OwnerEventsResponse,
  PriceOptionsRequest,
  PriceOptionsResponse,
  QuoteRequest,
  QuoteResponse,
  ReceiptRequest,
  ReceiptResponse,
  ReceiptResult,
  WaitForReceiptOptions
} from "./types.js";
import {
  parseEvents,
  parseManage,
  parseOrders,
  parsePriceOptionsResponse,
  parseQuoteResponse,
  parseReceipt,
  validateEventsRequest,
  validateListOrdersRequest,
  validateManageRequest,
  validatePriceOptionsRequest,
  validateQuoteRequest
} from "./validation.js";
import { assertChainId, assertHash } from "../utils/validation.js";

function bodyWithoutSignal<T extends { signal?: AbortSignal }>(request: T): Omit<T, "signal"> {
  const body = { ...request };
  delete body.signal;
  return body;
}

function retryAfterFromHeader(headers: Headers): number | null {
  const header = headers.get("Retry-After")?.trim();
  if (!header) return null;
  if (/^\d+(?:\.\d+)?$/.test(header)) return Number(header) * 1_000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

export class LimitOrdersClient {
  constructor(private readonly transport: ScoplTransport) {}

  async prices(request: PriceOptionsRequest): Promise<PriceOptionsResponse> {
    validatePriceOptionsRequest(request);
    return (await this.transport.json(
      "/api/v2/limit-orders/prices",
      { method: "POST", body: bodyWithoutSignal(request), signal: request.signal },
      parsePriceOptionsResponse
    )).data;
  }

  async quote(request: QuoteRequest): Promise<QuoteResponse> {
    validateQuoteRequest(request);
    return (await this.transport.json(
      "/api/v2/limit-orders/quote",
      { method: "POST", body: bodyWithoutSignal(request), signal: request.signal },
      parseQuoteResponse
    )).data;
  }

  async getReceipt(request: ReceiptRequest): Promise<ReceiptResult> {
    assertChainId(request.chainId);
    assertHash(request.transactionHash, "transactionHash");
    return (await this.transport.json(
      "/api/v2/limit-orders/receipt",
      { signal: request.signal, acceptedStatuses: [200, 202], retry: false },
      parseReceipt,
      { chainId: request.chainId, transactionHash: request.transactionHash }
    )).data;
  }

  async waitForReceipt(request: WaitForReceiptOptions): Promise<ReceiptResponse> {
    assertChainId(request.chainId);
    assertHash(request.transactionHash, "transactionHash");
    const maxWaitMs = request.maxWaitMs ?? request.timeoutMs ?? 120_000;
    if (!Number.isSafeInteger(maxWaitMs) || maxWaitMs <= 0) {
      throw new ScoplValidationError("maxWaitMs must be a positive integer.");
    }
    const started = Date.now();
    for (;;) {
      const response = await this.transport.json(
        "/api/v2/limit-orders/receipt",
        { signal: request.signal, acceptedStatuses: [200, 202], retry: false },
        parseReceipt,
        { chainId: request.chainId, transactionHash: request.transactionHash }
      );
      if (response.data.status === "confirmed") return response.data;
      const elapsed = Date.now() - started;
      const delay = response.data.retryAfterMs || retryAfterFromHeader(response.headers) || 1_000;
      if (elapsed + delay > maxWaitMs) throw new ScoplTimeoutError(maxWaitMs);
      await sleep(delay, request.signal);
    }
  }

  async list(request: ListOrdersRequest): Promise<ListOrdersResponse> {
    validateListOrdersRequest(request);
    return (await this.transport.json(
      "/api/v2/limit-orders/orders",
      { signal: request.signal },
      parseOrders,
      {
        chainId: request.chainId,
        owner: request.owner,
        status: request.status,
        version: request.version,
        venueId: request.venueId,
        poolAddress: request.poolAddress,
        createdTxHash: request.createdTxHash,
        page: request.page,
        limit: request.limit
      }
    )).data;
  }

  async events(request: OwnerEventsRequest): Promise<OwnerEventsResponse> {
    validateEventsRequest(request);
    return (await this.transport.json(
      "/api/v2/limit-orders/events",
      { signal: request.signal },
      parseEvents,
      {
        chainId: request.chainId,
        owner: request.owner,
        after: request.after ?? "0",
        limit: request.limit
      }
    )).data;
  }

  async *iterateEvents(request: IterateEventsRequest): AsyncGenerator<OwnerEventsResponse> {
    let after = request.after ?? "0";
    for (;;) {
      const page = await this.events({ ...request, after });
      yield page;
      // This assignment runs only after the host finishes processing the yielded page.
      after = page.nextLiveSeq;
      if (!page.hasMore) {
        if (request.poll === false) return;
        await sleep(page.pollAfterMs, request.signal);
      }
    }
  }

  async buildManagementTransaction(request: ManageRequest): Promise<ManageResponse> {
    validateManageRequest(request);
    const response = (await this.transport.json(
      "/api/v2/limit-orders/manage",
      { method: "POST", body: bodyWithoutSignal(request), signal: request.signal },
      parseManage
    )).data;
    if (
      response.transaction.to.toLowerCase() !== request.managerAddress.toLowerCase()
    ) {
      throw new ScoplTransactionPlanError({
        message: "Management transaction does not target the requested manager."
      });
    }
    return response;
  }
}

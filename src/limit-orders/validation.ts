import { ScoplValidationError } from "../http/errors.js";
import type { ProtocolVersion } from "../types.js";
import {
  address,
  array,
  assertAddress,
  assertBytes32,
  assertChainId,
  assertDecimalString,
  assertHash,
  assertIntegerRange,
  boolean,
  bytes32,
  decimalInteger,
  finiteNumber,
  hash,
  hex,
  integer,
  optionalAddress,
  positiveDecimal,
  positiveDecimalResponse,
  record,
  string,
  venueId
} from "../utils/validation.js";
import type {
  ListOrdersRequest,
  ListOrdersResponse,
  ManageRequest,
  ManageResponse,
  OwnerEventsRequest,
  OwnerEventsResponse,
  PendingReceiptResponse,
  PriceAdjustmentReason,
  PriceOption,
  PriceOptionsRequest,
  PriceOptionsResponse,
  QuoteRequest,
  QuoteResponse,
  ReceiptResponse,
  ReceiptResult,
  ScoplOrder,
  TransactionStep
} from "./types.js";

function protocolVersion(value: unknown, path: string): ProtocolVersion {
  const version = integer(value, path);
  if (version !== 3 && version !== 4) {
    throw new ScoplValidationError("Protocol version must be 3 or 4", path);
  }
  return version;
}

export function validatePriceOptionsRequest(request: PriceOptionsRequest): void {
  assertChainId(request.chainId);
  if (!/^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(request.pool)) {
    throw new ScoplValidationError("pool must be an address or bytes32 pool ID.", "pool");
  }
  assertAddress(request.tokenIn, "tokenIn");
  if (request.anchorPrice !== undefined) positiveDecimal(request.anchorPrice, "anchorPrice");
  assertIntegerRange(request.count, 1, 101, "count");
}

export function validateQuoteRequest(request: QuoteRequest): void {
  validatePriceOptionsRequest(request);
  assertBytes32(request.integrationId, "integrationId");
  if (/^0x0{64}$/i.test(request.integrationId)) {
    throw new ScoplValidationError("integrationId cannot be zero.", "integrationId");
  }
  positiveDecimal(request.amountIn, "amountIn");
  positiveDecimal(request.price, "price");
  if (request.owner !== undefined) assertAddress(request.owner, "owner");
  assertIntegerRange(request.slippageBps, 0, 5_000, "slippageBps");
  assertIntegerRange(request.deadlineSeconds, 60, 86_400, "deadlineSeconds");
  assertIntegerRange(request.priceOptionCount, 1, 21, "priceOptionCount");
}

function parseTransactionStep(value: unknown, path: string): TransactionStep {
  const step = record(value, path);
  const result = step.result === undefined ? undefined : record(step.result, `${path}.result`);
  return {
    kind: string(step.kind, `${path}.kind`),
    to: address(step.to, `${path}.to`),
    data: hex(step.data, `${path}.data`),
    value: decimalInteger(step.value, `${path}.value`),
    required: boolean(step.required, `${path}.required`),
    description: string(step.description, `${path}.description`),
    ...(result === undefined ? {} : {
      result: {
        endpoint: string(result.endpoint, `${path}.result.endpoint`),
        queryParameters: array(
          result.queryParameters,
          `${path}.result.queryParameters`
        ).map((entry, index) => string(entry, `${path}.result.queryParameters[${index}]`)),
        ...(result.chainId === undefined
          ? {}
          : { chainId: integer(result.chainId, `${path}.result.chainId`) }),
        event: string(result.event, `${path}.result.event`),
        fields: array(result.fields, `${path}.result.fields`).map((entry, index) =>
          string(entry, `${path}.result.fields[${index}]`)
        )
      }
    })
  };
}

function parsePriceOption(value: unknown, path: string): PriceOption {
  const option = record(value, path);
  return {
    tickLower: integer(option.tickLower, `${path}.tickLower`),
    tickUpper: integer(option.tickUpper, `${path}.tickUpper`),
    executionPrice: positiveDecimalResponse(option.executionPrice, `${path}.executionPrice`),
    ...(option.fullFillPrice === undefined
      ? {}
      : { fullFillPrice: positiveDecimalResponse(option.fullFillPrice, `${path}.fullFillPrice`) }),
    ...(option.rangeLow === undefined
      ? {}
      : { rangeLow: positiveDecimalResponse(option.rangeLow, `${path}.rangeLow`) }),
    ...(option.rangeHigh === undefined
      ? {}
      : { rangeHigh: positiveDecimalResponse(option.rangeHigh, `${path}.rangeHigh`) })
  };
}

export function parsePriceOptionsResponse(value: unknown): PriceOptionsResponse {
  const root = record(value, "prices");
  const possible = root.totalPossible;
  if (typeof possible !== "string" && typeof possible !== "number") {
    throw new ScoplValidationError("Expected string or number", "prices.totalPossible");
  }
  return {
    ...root,
    apiVersion: string(root.apiVersion, "prices.apiVersion"),
    chainId: integer(root.chainId, "prices.chainId"),
    currentTick: integer(root.currentTick, "prices.currentTick"),
    options: array(root.options, "prices.options").map((entry, index) =>
      parsePriceOption(entry, `prices.options[${index}]`)
    ),
    totalPossible: possible
  };
}

export function parseQuoteResponse(value: unknown): QuoteResponse {
  const root = record(value, "quote");
  const price = record(root.price, "quote.price");
  const adjustment = string(price.adjustmentReason, "quote.price.adjustmentReason");
  if (!(["none", "tick-rounding", "market-boundary"] as string[]).includes(adjustment)) {
    throw new ScoplValidationError("Unknown price adjustment reason", "quote.price.adjustmentReason");
  }
  const protocol = record(root.protocol, "quote.protocol");
  return {
    ...root,
    apiVersion: string(root.apiVersion, "quote.apiVersion"),
    chainId: integer(root.chainId, "quote.chainId"),
    ready: boolean(root.ready, "quote.ready"),
    warnings: array(root.warnings, "quote.warnings").map((entry, index) =>
      string(entry, `quote.warnings[${index}]`)
    ),
    price: {
      ...price,
      requestedPrice: positiveDecimalResponse(price.requestedPrice, "quote.price.requestedPrice"),
      executionPrice: positiveDecimalResponse(price.executionPrice, "quote.price.executionPrice"),
      adjustmentReason: adjustment as PriceAdjustmentReason,
      priceDifferenceBps: finiteNumber(
        price.priceDifferenceBps,
        "quote.price.priceDifferenceBps"
      )
    },
    protocol: {
      ...protocol,
      manager: address(protocol.manager, "quote.protocol.manager"),
      positionManager: address(protocol.positionManager, "quote.protocol.positionManager"),
      gasReserveWei: decimalInteger(protocol.gasReserveWei, "quote.protocol.gasReserveWei")
    },
    transactions: array(root.transactions, "quote.transactions").map((entry, index) =>
      parseTransactionStep(entry, `quote.transactions[${index}]`)
    )
  };
}

export function parseReceipt(value: unknown): ReceiptResult {
  const root = record(value, "receipt");
  const status = string(root.status, "receipt.status");
  const base = {
    apiVersion: string(root.apiVersion, "receipt.apiVersion"),
    chainId: integer(root.chainId, "receipt.chainId"),
    transactionHash: hash(root.transactionHash, "receipt.transactionHash")
  };
  if (status === "pending") {
    return {
      ...base,
      status,
      retryAfterMs: integer(root.retryAfterMs, "receipt.retryAfterMs")
    } satisfies PendingReceiptResponse;
  }
  if (status !== "confirmed") {
    throw new ScoplValidationError("Unknown receipt status", "receipt.status");
  }
  const poolId = root.poolId === null ? null : bytes32(root.poolId, "receipt.poolId");
  return {
    ...base,
    status,
    blockNumber: decimalInteger(root.blockNumber, "receipt.blockNumber"),
    orderId: decimalInteger(root.orderId, "receipt.orderId"),
    tokenId: decimalInteger(root.tokenId, "receipt.tokenId"),
    protocolVersion: protocolVersion(root.protocolVersion, "receipt.protocolVersion"),
    venueId: venueId(root.venueId, "receipt.venueId"),
    positionManager: address(root.positionManager, "receipt.positionManager"),
    managerAddress: address(root.managerAddress, "receipt.managerAddress"),
    owner: address(root.owner, "receipt.owner"),
    poolId,
    tokenIn: address(root.tokenIn, "receipt.tokenIn"),
    tokenOut: address(root.tokenOut, "receipt.tokenOut"),
    amountIn: decimalInteger(root.amountIn, "receipt.amountIn"),
    tickLower: integer(root.tickLower, "receipt.tickLower"),
    tickUpper: integer(root.tickUpper, "receipt.tickUpper"),
    gasReserveWei: decimalInteger(root.gasReserveWei, "receipt.gasReserveWei"),
    indexedOrderUrl: string(root.indexedOrderUrl, "receipt.indexedOrderUrl")
  } satisfies ReceiptResponse;
}

export function validateListOrdersRequest(request: ListOrdersRequest): void {
  assertChainId(request.chainId);
  optionalAddress(request.owner, "owner");
  if (request.createdTxHash !== undefined) assertHash(request.createdTxHash, "createdTxHash");
  assertIntegerRange(request.page, 1, 1_000, "page");
  assertIntegerRange(request.limit, 1, 200, "limit");
}

function parseOrder(value: unknown, path: string): ScoplOrder {
  const item = record(value, path);
  const status = string(item.status, `${path}.status`);
  if (!(["open", "filled", "cancelled", "stale"] as string[]).includes(status)) {
    throw new ScoplValidationError("Unknown indexed order status", `${path}.status`);
  }
  const poolAddress = item.poolAddress === null
    ? null
    : string(item.poolAddress, `${path}.poolAddress`) as `0x${string}`;
  return {
    ...item,
    orderKey: string(item.orderKey, `${path}.orderKey`),
    chainId: integer(item.chainId, `${path}.chainId`),
    managerAddress: address(item.managerAddress, `${path}.managerAddress`),
    venueId: venueId(item.venueId, `${path}.venueId`),
    ...(item.positionManager === undefined
      ? {}
      : { positionManager: address(item.positionManager, `${path}.positionManager`) }),
    protocolVersion: protocolVersion(item.protocolVersion, `${path}.protocolVersion`),
    contractVersion: integer(item.contractVersion, `${path}.contractVersion`),
    orderId: decimalInteger(item.orderId, `${path}.orderId`),
    owner: address(item.owner, `${path}.owner`),
    tokenId: decimalInteger(item.tokenId, `${path}.tokenId`),
    tokenIn: address(item.tokenIn, `${path}.tokenIn`),
    tokenOut: address(item.tokenOut, `${path}.tokenOut`),
    poolAddress,
    ...(item.poolId === undefined
      ? {}
      : { poolId: item.poolId === null ? null : bytes32(item.poolId, `${path}.poolId`) }),
    status: status as ScoplOrder["status"],
    createdBlock: decimalInteger(item.createdBlock, `${path}.createdBlock`),
    updatedBlock: decimalInteger(item.updatedBlock, `${path}.updatedBlock`),
    createdTxHash: hash(item.createdTxHash, `${path}.createdTxHash`)
  };
}

export function parseOrders(value: unknown): ListOrdersResponse {
  const root = record(value, "orders");
  if (root.source !== "scopl-indexer") {
    throw new ScoplValidationError("Unexpected indexed order source", "orders.source");
  }
  return {
    data: array(root.data, "orders.data").map((entry, index) =>
      parseOrder(entry, `orders.data[${index}]`)
    ),
    source: "scopl-indexer",
    page: integer(root.page, "orders.page"),
    limit: integer(root.limit, "orders.limit"),
    total: integer(root.total, "orders.total"),
    updatedAt: string(root.updatedAt, "orders.updatedAt")
  };
}

export function validateEventsRequest(request: OwnerEventsRequest): void {
  assertChainId(request.chainId);
  assertAddress(request.owner, "owner");
  if (request.after !== undefined) assertDecimalString(request.after, "after");
  assertIntegerRange(request.limit, 1, 200, "limit");
}

export function parseEvents(value: unknown): OwnerEventsResponse {
  const root = record(value, "events");
  const data = array(root.data, "events.data").map((entry, index) => {
    const path = `events.data[${index}]`;
    const item = record(entry, path);
    const transactionHash = hash(item.transactionHash, `${path}.transactionHash`);
    const logIndex = integer(item.logIndex, `${path}.logIndex`);
    return {
      liveSeq: decimalInteger(item.liveSeq, `${path}.liveSeq`),
      protocolVersion: protocolVersion(item.protocolVersion, `${path}.protocolVersion`),
      venueId: venueId(item.venueId, `${path}.venueId`),
      positionManager: address(item.positionManager, `${path}.positionManager`),
      managerAddress: address(item.managerAddress, `${path}.managerAddress`),
      orderId: item.orderId === null ? null : decimalInteger(item.orderId, `${path}.orderId`),
      event: string(item.event, `${path}.event`),
      blockNumber: decimalInteger(item.blockNumber, `${path}.blockNumber`),
      transactionHash,
      transactionIndex: integer(item.transactionIndex, `${path}.transactionIndex`),
      logIndex,
      payload: record(item.payload, `${path}.payload`),
      indexedAt: string(item.indexedAt, `${path}.indexedAt`),
      dedupeKey: `${transactionHash.toLowerCase()}:${logIndex}`
    };
  });
  return {
    apiVersion: string(root.apiVersion, "events.apiVersion"),
    chainId: integer(root.chainId, "events.chainId"),
    owner: address(root.owner, "events.owner"),
    data,
    nextLiveSeq: decimalInteger(root.nextLiveSeq, "events.nextLiveSeq"),
    hasMore: boolean(root.hasMore, "events.hasMore"),
    pollAfterMs: integer(root.pollAfterMs, "events.pollAfterMs")
  };
}

export function validateManageRequest(request: ManageRequest): void {
  assertChainId(request.chainId);
  assertAddress(request.managerAddress, "managerAddress");
  assertDecimalString(request.orderId, "orderId");
  if (request.action === "increase-gas-reserve") {
    if (request.amountWei === undefined) {
      throw new ScoplValidationError("amountWei is required for reserve increases.", "amountWei");
    }
    assertDecimalString(request.amountWei, "amountWei");
  } else if (request.amountWei !== undefined) {
    throw new ScoplValidationError("amountWei is only valid for reserve increases.", "amountWei");
  }
}

export function parseManage(value: unknown): ManageResponse {
  const root = record(value, "manage");
  const transaction = record(root.transaction, "manage.transaction");
  return {
    apiVersion: string(root.apiVersion, "manage.apiVersion"),
    chainId: integer(root.chainId, "manage.chainId"),
    contractVersion: integer(root.contractVersion, "manage.contractVersion"),
    protocolVersion: protocolVersion(root.protocolVersion, "manage.protocolVersion"),
    venueId: venueId(root.venueId, "manage.venueId"),
    positionManager: address(root.positionManager, "manage.positionManager"),
    orderId: decimalInteger(root.orderId, "manage.orderId"),
    transaction: {
      ...(transaction.kind === undefined
        ? {}
        : { kind: string(transaction.kind, "manage.transaction.kind") }),
      to: address(transaction.to, "manage.transaction.to"),
      data: hex(transaction.data, "manage.transaction.data"),
      value: decimalInteger(transaction.value, "manage.transaction.value")
    }
  };
}

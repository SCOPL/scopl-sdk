import { ScoplValidationError } from "../http/errors.js";
import type {
  Address,
  Bytes32,
  Hex,
  TransactionHash,
  VenueId
} from "../types.js";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const BYTES32 = /^0x[a-fA-F0-9]{64}$/;
const HEX = /^0x(?:[a-fA-F0-9]{2})*$/;
const DECIMAL_INTEGER = /^\d+$/;
const POSITIVE_DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const VENUES = new Set<VenueId>(["uniswap-v3", "ramses-v3", "uniswap-v4"]);

export function record(value: unknown, path = "response"): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ScoplValidationError("Expected an object", path);
  }
  return value as Record<string, unknown>;
}

export function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ScoplValidationError("Expected an array", path);
  return value;
}

export function string(value: unknown, path: string): string {
  if (typeof value !== "string") throw new ScoplValidationError("Expected a string", path);
  return value;
}

export function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new ScoplValidationError("Expected a boolean", path);
  return value;
}

export function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ScoplValidationError("Expected a finite number", path);
  }
  return value;
}

export function integer(value: unknown, path: string): number {
  const result = finiteNumber(value, path);
  if (!Number.isSafeInteger(result)) throw new ScoplValidationError("Expected a safe integer", path);
  return result;
}

export function address(value: unknown, path: string): Address {
  const result = string(value, path);
  if (!ADDRESS.test(result)) throw new ScoplValidationError("Expected an EVM address", path);
  return result as Address;
}

export function nullableAddress(value: unknown, path: string): Address | null {
  return value === null ? null : address(value, path);
}

export function bytes32(value: unknown, path: string): Bytes32 {
  const result = string(value, path);
  if (!BYTES32.test(result)) throw new ScoplValidationError("Expected 32-byte hex", path);
  return result as Bytes32;
}

export function hash(value: unknown, path: string): TransactionHash {
  return bytes32(value, path);
}

export function hex(value: unknown, path: string): Hex {
  const result = string(value, path);
  if (!HEX.test(result)) throw new ScoplValidationError("Expected even-length hex data", path);
  return result as Hex;
}

export function decimalInteger(value: unknown, path: string): string {
  const result = string(value, path);
  if (!DECIMAL_INTEGER.test(result)) {
    throw new ScoplValidationError("Expected a non-negative decimal integer string", path);
  }
  return result;
}

export function positiveDecimal(value: unknown, path: string): string {
  const result = string(value, path);
  if (!POSITIVE_DECIMAL.test(result) || /^0(?:\.0+)?$/.test(result)) {
    throw new ScoplValidationError("Expected a positive decimal string", path);
  }
  return result;
}

export function venueId(value: unknown, path: string): VenueId {
  const result = string(value, path) as VenueId;
  if (!VENUES.has(result)) throw new ScoplValidationError("Unsupported venue ID", path);
  return result;
}

export function optionalAddress(value: unknown, path: string): Address | undefined {
  return value === undefined ? undefined : address(value, path);
}

export function assertChainId(value: number, path = "chainId"): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ScoplValidationError("Expected a positive safe integer", path);
  }
  return value;
}

export function assertIntegerRange(
  value: number | undefined,
  minimum: number,
  maximum: number,
  path: string
): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ScoplValidationError(
      `Expected an integer from ${minimum} through ${maximum}`,
      path
    );
  }
}

export function assertDecimalString(value: string, path: string, positive = false): void {
  if (!DECIMAL_INTEGER.test(value) && !POSITIVE_DECIMAL.test(value)) {
    throw new ScoplValidationError("Expected a decimal string", path);
  }
  if (positive && (/^0(?:\.0+)?$/.test(value) || !POSITIVE_DECIMAL.test(value))) {
    throw new ScoplValidationError("Expected a positive decimal string", path);
  }
}

export function assertAddress(value: string, path: string): asserts value is Address {
  address(value, path);
}

export function assertBytes32(value: string, path: string): asserts value is Bytes32 {
  bytes32(value, path);
}

export function assertHash(value: string, path: string): asserts value is TransactionHash {
  hash(value, path);
}

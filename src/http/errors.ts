import type { TransactionHash } from "../types.js";
import type { TransactionStep } from "../limit-orders/types.js";

export class ScoplError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ScoplApiError extends ScoplError {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(input: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  }) {
    super(input.message);
    this.status = input.status;
    this.code = input.code;
    this.details = input.details;
  }
}

export class ScoplNetworkError extends ScoplError {}

export class ScoplTimeoutError extends ScoplError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, options?: ErrorOptions) {
    super(`SCOPL request timed out after ${timeoutMs}ms.`, options);
    this.timeoutMs = timeoutMs;
  }
}

export class ScoplValidationError extends ScoplError {
  readonly path?: string;

  constructor(message: string, path?: string, options?: ErrorOptions) {
    super(path ? `${message} (${path})` : message, options);
    this.path = path;
  }
}

export class ScoplVersionError extends ScoplError {
  readonly expectedMajor: number;
  readonly receivedVersion: string;

  constructor(expectedMajor: number, receivedVersion: string) {
    super(`Unsupported SCOPL API version ${receivedVersion}; expected major ${expectedMajor}.`);
    this.expectedMajor = expectedMajor;
    this.receivedVersion = receivedVersion;
  }
}

export interface CompletedTransaction {
  step: TransactionStep;
  hash: TransactionHash;
  receipt: unknown;
}

export class ScoplTransactionPlanError extends ScoplError {
  readonly completedTransactions: readonly CompletedTransaction[];
  readonly failedStep?: TransactionStep;

  constructor(input: {
    message: string;
    completedTransactions?: readonly CompletedTransaction[];
    failedStep?: TransactionStep;
    cause?: unknown;
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.completedTransactions = input.completedTransactions ?? [];
    this.failedStep = input.failedStep;
  }
}

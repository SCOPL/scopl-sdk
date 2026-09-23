import type { Address, Bytes32, RequestOptions } from "../types.js";
import type { UnsignedTransaction } from "../limit-orders/types.js";

export interface RegisterIntegrationRequest extends RequestOptions {
  chainId: number;
  owner: Address;
  registrationKey: Bytes32;
  feeRecipient: Address;
  userShareBps: number;
}

export interface UpdateIntegrationRequest extends RequestOptions {
  chainId: number;
  integrationId: Bytes32;
  feeRecipient: Address;
  userShareBps: number;
}

export interface IntegrationEconomics {
  userShareBps: number;
  integratorShareBps: number;
  protocolShareBps: number;
}

export interface IntegrationTransactionResponse {
  apiVersion: string;
  chainId: number;
  integrationId: Bytes32;
  economics: IntegrationEconomics;
  transaction: UnsignedTransaction;
}

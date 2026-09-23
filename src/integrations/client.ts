import type { ConfigClient } from "../config/client.js";
import { ScoplTransactionPlanError, ScoplValidationError } from "../http/errors.js";
import type { ScoplTransport } from "../http/transport.js";
import {
  address,
  assertAddress,
  assertBytes32,
  assertChainId,
  assertIntegerRange,
  bytes32,
  decimalInteger,
  hex,
  integer,
  record,
  string
} from "../utils/validation.js";
import type {
  IntegrationTransactionResponse,
  RegisterIntegrationRequest,
  UpdateIntegrationRequest
} from "./types.js";

function validateShare(value: number): void {
  assertIntegerRange(value, 0, 7_500, "userShareBps");
}

function parseResponse(value: unknown): IntegrationTransactionResponse {
  const root = record(value, "integration");
  const economics = record(root.economics, "integration.economics");
  const transaction = record(root.transaction, "integration.transaction");
  return {
    apiVersion: string(root.apiVersion, "integration.apiVersion"),
    chainId: integer(root.chainId, "integration.chainId"),
    integrationId: bytes32(root.integrationId, "integration.integrationId"),
    economics: {
      userShareBps: integer(economics.userShareBps, "integration.economics.userShareBps"),
      integratorShareBps: integer(
        economics.integratorShareBps,
        "integration.economics.integratorShareBps"
      ),
      protocolShareBps: integer(
        economics.protocolShareBps,
        "integration.economics.protocolShareBps"
      )
    },
    transaction: {
      to: address(transaction.to, "integration.transaction.to"),
      data: hex(transaction.data, "integration.transaction.data"),
      value: decimalInteger(transaction.value, "integration.transaction.value")
    }
  };
}

function requestBody<T extends { signal?: AbortSignal }>(request: T): Omit<T, "signal"> {
  const body = { ...request };
  delete body.signal;
  return body;
}

export class IntegrationsClient {
  constructor(
    private readonly transport: ScoplTransport,
    private readonly config: ConfigClient
  ) {}

  async buildRegistration(
    request: RegisterIntegrationRequest
  ): Promise<IntegrationTransactionResponse> {
    assertChainId(request.chainId);
    assertAddress(request.owner, "owner");
    assertBytes32(request.registrationKey, "registrationKey");
    assertAddress(request.feeRecipient, "feeRecipient");
    validateShare(request.userShareBps);
    return this.build(
      "/api/v2/integrations/register",
      request,
      request.signal
    );
  }

  async buildUpdate(
    request: UpdateIntegrationRequest
  ): Promise<IntegrationTransactionResponse> {
    assertChainId(request.chainId);
    assertBytes32(request.integrationId, "integrationId");
    assertAddress(request.feeRecipient, "feeRecipient");
    validateShare(request.userShareBps);
    return this.build(
      "/api/v2/integrations/update",
      request,
      request.signal
    );
  }

  private async build<T extends { chainId: number; signal?: AbortSignal }>(
    path: string,
    request: T,
    signal?: AbortSignal
  ): Promise<IntegrationTransactionResponse> {
    const chain = await this.config.getChain(request.chainId, { signal });
    if (!chain.orderPolicy) {
      throw new ScoplValidationError(
        `Integration registration is not enabled on chain ${request.chainId}.`
      );
    }
    const response = (await this.transport.json(
      path,
      { method: "POST", body: requestBody(request), signal },
      parseResponse
    )).data;
    if (response.transaction.to.toLowerCase() !== chain.orderPolicy.toLowerCase()) {
      throw new ScoplTransactionPlanError({
        message: "Integration transaction does not target the configured order policy."
      });
    }
    if (response.transaction.value !== "0") {
      throw new ScoplTransactionPlanError({
        message: "Integration configuration transaction unexpectedly requires native value."
      });
    }
    return response;
  }
}

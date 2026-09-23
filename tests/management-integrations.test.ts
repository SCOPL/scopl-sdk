import { describe, expect, it, vi } from "vitest";

import {
  ScoplClient,
  ScoplTransactionPlanError,
  ScoplValidationError
} from "../src/index.js";
import type { ManageAction } from "../src/index.js";
import type { Address } from "../src/index.js";
import type { ScoplFetch } from "../src/http/transport.js";
import { A, B, C, D, ID, configFixture, jsonResponse } from "./fixtures.js";

function manageResponse(action: ManageAction, to: Address = A, amount = "0") {
  return {
    apiVersion: "2.0.0",
    chainId: 4663,
    contractVersion: 3,
    protocolVersion: 3,
    venueId: "uniswap-v3",
    positionManager: B,
    orderId: "90071992547409930000",
    transaction: { kind: action, to, data: "0x1234", value: amount }
  };
}

describe("management transaction builder", () => {
  it("supports all current actions and preserves the explicit manager identity", async () => {
    const requests: unknown[] = [];
    const actions: ManageAction[] = ["cancel", "execute", "mark-stale", "increase-gas-reserve"];
    const fetch = vi.fn<ScoplFetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { action: ManageAction; amountWei?: string };
      requests.push(body);
      return jsonResponse(manageResponse(body.action, A, body.amountWei ?? "0"));
    });
    const client = new ScoplClient({ fetch });

    for (const action of actions) {
      const result = await client.limitOrders.buildManagementTransaction({
        chainId: 4663,
        managerAddress: A,
        action,
        orderId: "90071992547409930000",
        ...(action === "increase-gas-reserve" ? { amountWei: "123" } : {})
      });
      expect(result.transaction.to).toBe(A);
    }
    expect(requests).toHaveLength(4);
  });

  it("requires reserve amount and never chooses a manager from orderId alone", async () => {
    const client = new ScoplClient({ fetch: (async () => jsonResponse(manageResponse("cancel"))) as ScoplFetch });
    await expect(client.limitOrders.buildManagementTransaction({
      chainId: 4663,
      managerAddress: A,
      action: "increase-gas-reserve",
      orderId: "1"
    })).rejects.toBeInstanceOf(ScoplValidationError);

    const wrong = new ScoplClient({ fetch: (async () => jsonResponse(manageResponse("cancel", C))) as ScoplFetch });
    await expect(wrong.limitOrders.buildManagementTransaction({
      chainId: 4663,
      managerAddress: A,
      action: "cancel",
      orderId: "1"
    })).rejects.toBeInstanceOf(ScoplTransactionPlanError);
  });
});

const integrationResponse = {
  apiVersion: "2.0.0",
  chainId: 4663,
  integrationId: ID,
  economics: {
    userShareBps: 3_750,
    integratorShareBps: 3_750,
    protocolShareBps: 2_500
  },
  transaction: { to: D, data: "0x1234", value: "0" }
};

describe("integration transaction builders", () => {
  function integrationClient() {
    const bodies: unknown[] = [];
    const fetch = vi.fn<ScoplFetch>(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/config")) return jsonResponse(configFixture);
      bodies.push(JSON.parse(String(init?.body)) as unknown);
      return jsonResponse(integrationResponse);
    });
    return { client: new ScoplClient({ fetch }), bodies };
  }

  it("accepts registration boundary shares and returns deterministic ID untouched", async () => {
    for (const userShareBps of [0, 7_500]) {
      const { client } = integrationClient();
      const result = await client.integrations.buildRegistration({
        chainId: 4663,
        owner: A,
        registrationKey: ID,
        feeRecipient: C,
        userShareBps
      });
      expect(result.integrationId).toBe(ID);
      expect(result.transaction).toMatchObject({ to: D, value: "0" });
    }
  });

  it("builds updates and rejects invalid keys or shares", async () => {
    const { client, bodies } = integrationClient();
    await client.integrations.buildUpdate({
      chainId: 4663,
      integrationId: ID,
      feeRecipient: C,
      userShareBps: 1_500
    });
    expect(bodies[0]).toMatchObject({ integrationId: ID, userShareBps: 1_500 });

    for (const userShareBps of [-1, 7_501]) {
      await expect(client.integrations.buildUpdate({
        chainId: 4663,
        integrationId: ID,
        feeRecipient: C,
        userShareBps
      })).rejects.toBeInstanceOf(ScoplValidationError);
    }
    await expect(client.integrations.buildRegistration({
      chainId: 4663,
      owner: A,
      registrationKey: "0x12" as `0x${string}`,
      feeRecipient: C,
      userShareBps: 1
    })).rejects.toBeInstanceOf(ScoplValidationError);
  });

  it("fails closed if the API transaction does not target current order policy", async () => {
    const fetch = vi.fn<ScoplFetch>(async (input) =>
      new URL(String(input)).pathname.endsWith("/config")
        ? jsonResponse(configFixture)
        : jsonResponse({ ...integrationResponse, transaction: { ...integrationResponse.transaction, to: A } })
    );
    const client = new ScoplClient({ fetch });
    await expect(client.integrations.buildUpdate({
      chainId: 4663,
      integrationId: ID,
      feeRecipient: C,
      userShareBps: 1
    })).rejects.toBeInstanceOf(ScoplTransactionPlanError);
  });
});

import { createRequire } from "node:module";

const esm = await import("@scopl/sdk");
const esmViem = await import("@scopl/sdk/viem");
const require = createRequire(import.meta.url);
const cjs = require("@scopl/sdk");
const cjsViem = require("@scopl/sdk/viem");

for (const [label, value] of [
  ["ESM root", esm.ScoplClient],
  ["ESM viem", esmViem.executeTransactionPlan],
  ["CJS root", cjs.ScoplClient],
  ["CJS viem", cjsViem.executeTransactionPlan]
]) {
  if (typeof value !== "function") throw new Error(`${label} export is unavailable.`);
}

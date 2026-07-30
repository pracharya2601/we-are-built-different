import { loadBillingConfig } from "./config";
import { BillingError } from "./errors";
import { StripeRestGateway } from "./stripe-client";
import type {
  BillingAuthAdapter,
  BillingRuntime,
  BillingStore,
} from "./types";

const RUNTIME_KEY = Symbol.for("built-different.billing.runtime");

type RuntimeGlobal = typeof globalThis & {
  [RUNTIME_KEY]?: BillingRuntime;
};

/**
 * Called by the root integration layer after it wires Auth0 and D1 adapters.
 */
export function installBillingRuntime(runtime: BillingRuntime): void {
  (globalThis as RuntimeGlobal)[RUNTIME_KEY] = runtime;
}

export function createBillingRuntime(input: {
  auth: BillingAuthAdapter;
  store: BillingStore;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}): BillingRuntime {
  const config = loadBillingConfig(input.env);
  return {
    auth: input.auth,
    store: input.store,
    config,
    stripe: new StripeRestGateway(config.secretKey, { fetch: input.fetch }),
  };
}

export function getBillingRuntime(): BillingRuntime {
  const runtime = (globalThis as RuntimeGlobal)[RUNTIME_KEY];
  if (!runtime) return unavailable();
  return runtime;
}

const unavailable = (): never => {
  throw new BillingError(
    "Billing adapters have not been wired.",
    "billing_runtime_not_configured",
    503,
  );
};

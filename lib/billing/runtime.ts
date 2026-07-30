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
    stripe:
      config.mode === "live"
        ? new StripeRestGateway(config.secretKey, { fetch: input.fetch })
        : null,
  };
}

export function getBillingRuntime(): BillingRuntime {
  return (
    (globalThis as RuntimeGlobal)[RUNTIME_KEY] ?? {
      auth: unavailableAuth,
      store: unavailableStore,
      config: loadBillingConfig({}),
      stripe: null,
    }
  );
}

const unavailable = (): never => {
  throw new BillingError(
    "Billing adapters have not been wired.",
    "billing_runtime_not_configured",
    503,
  );
};

const unavailableAuth: BillingAuthAdapter = {
  requireBillingManager: async () => unavailable(),
};

const unavailableStore: BillingStore = {
  getBillingAccount: async () => unavailable(),
  getBillingAccountByStripeCustomerId: async () => unavailable(),
  setStripeCustomerId: async () => unavailable(),
  claimStripeEvent: async () => unavailable(),
  completeStripeEvent: async () => unavailable(),
  failStripeEvent: async () => unavailable(),
  upsertSubscriptionProjection: async () => unavailable(),
};

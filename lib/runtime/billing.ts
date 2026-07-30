import { getDb } from "@/db";
import {
  createBillingAuthAdapter,
  createBillingRuntime,
  type BillingRuntime,
} from "@/lib/billing";
import { requireWorkspacePermission } from "@/lib/auth";
import { createDataBillingStore } from "@/lib/data";

/**
 * Composes provider-facing billing code with the application-owned identity
 * and D1 projections. Route handlers create this lightweight object per
 * request; the underlying D1 binding and provider clients remain runtime
 * managed.
 */
export function getAppBillingRuntime(): BillingRuntime {
  return createBillingRuntime({
    auth: createBillingAuthAdapter(requireWorkspacePermission),
    store: createDataBillingStore(getDb()),
  });
}

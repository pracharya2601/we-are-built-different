import type {
  BillingConfig,
  CheckoutPrice,
} from "./types";
import { BillingError } from "./errors.ts";

export const MIN_DYNAMIC_UNIT_AMOUNT = 50;
export const MAX_DYNAMIC_UNIT_AMOUNT = 10_000_000;

export function dynamicPricingKey(
  productKey: string,
  unitAmount: number,
): string {
  return `dynamic:${productKey}:usd:${unitAmount}:month`;
}

export function resolveCheckoutPrice(
  input: Record<string, unknown>,
  config: BillingConfig,
): CheckoutPrice {
  if (typeof input.planKey === "string") {
    const plan = config.plans.get(input.planKey);
    if (!plan) {
      throw new BillingError(
        "Select a configured billing plan.",
        "invalid_billing_plan",
        400,
      );
    }
    return { kind: "catalog", ...plan };
  }

  if (input.type !== "dynamic-monthly") {
    throw new BillingError(
      "Select a catalog plan or a dynamic monthly price.",
      "invalid_pricing_request",
      400,
    );
  }
  if (typeof input.productKey !== "string") {
    throw invalidDynamicPrice();
  }
  const product = config.products.get(input.productKey);
  if (!product) {
    throw new BillingError(
      "The dynamic price product is not configured.",
      "invalid_billing_product",
      400,
    );
  }
  if (
    !Number.isSafeInteger(input.unitAmount) ||
    (input.unitAmount as number) < MIN_DYNAMIC_UNIT_AMOUNT ||
    (input.unitAmount as number) > MAX_DYNAMIC_UNIT_AMOUNT
  ) {
    throw invalidDynamicPrice();
  }
  if (input.currency !== undefined && input.currency !== "usd") {
    throw new BillingError(
      "Dynamic Checkout currently supports USD only.",
      "unsupported_billing_currency",
      400,
    );
  }

  const unitAmount = input.unitAmount as number;
  return {
    kind: "dynamic",
    key: dynamicPricingKey(product.key, unitAmount),
    productKey: product.key,
    productId: product.productId,
    label: `${product.label} custom`,
    currency: "usd",
    unitAmount,
    interval: "month",
  };
}

function invalidDynamicPrice(): BillingError {
  return new BillingError(
    `Dynamic unitAmount must be an integer from ${MIN_DYNAMIC_UNIT_AMOUNT} to ${MAX_DYNAMIC_UNIT_AMOUNT} cents.`,
    "invalid_dynamic_amount",
    400,
  );
}

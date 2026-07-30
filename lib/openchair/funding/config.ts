export type AppointmentFundingConfig = {
  secretKey: string;
  webhookSecret: string;
  expectedLivemode: boolean | null;
  webhookToleranceSeconds: number;
};

type Environment = Record<string, string | undefined>;

export function loadAppointmentFundingConfig(
  environment: Environment =
    typeof process === "undefined" ? {} : process.env,
): AppointmentFundingConfig {
  const secretKey = environment.STRIPE_APPOINTMENT_SECRET_KEY?.trim();
  const webhookSecret =
    environment.STRIPE_APPOINTMENT_WEBHOOK_SECRET?.trim();
  if (!secretKey || !/^sk_(test|live)_/u.test(secretKey)) {
    throw new Error("STRIPE_APPOINTMENT_SECRET_KEY is required.");
  }
  if (!webhookSecret || !webhookSecret.startsWith("whsec_")) {
    throw new Error("STRIPE_APPOINTMENT_WEBHOOK_SECRET is required.");
  }
  return {
    secretKey,
    webhookSecret,
    expectedLivemode: secretKey.includes("_live_")
      ? true
      : secretKey.includes("_test_")
        ? false
        : null,
    webhookToleranceSeconds: positiveInteger(
      environment.STRIPE_APPOINTMENT_WEBHOOK_TOLERANCE_SECONDS,
      300,
    ),
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

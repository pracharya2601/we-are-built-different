import { getDb } from "@/db";
import {
  loadAppointmentFundingConfig,
  StripeAppointmentPaymentProvider,
} from "@/lib/openchair/funding";

export function getAppointmentFundingRuntime() {
  const config = loadAppointmentFundingConfig();
  return {
    db: getDb(),
    config,
    provider: new StripeAppointmentPaymentProvider(config.secretKey),
  };
}

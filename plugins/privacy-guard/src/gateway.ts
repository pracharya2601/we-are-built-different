import { PrivacyGuardError } from "./error.ts";
import { scrubForLlm } from "./scrubber.ts";
import type {
  PrivacyAuditEvent,
  PrivacySafeGatewayOptions,
} from "./types.ts";

export function createPrivacySafeLlmGateway<Request, Response>(
  options: PrivacySafeGatewayOptions<Request, Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let scrubbed;

    try {
      scrubbed = scrubForLlm(request, options.scrub);
    } catch (error) {
      if (error instanceof PrivacyGuardError) {
        const event: PrivacyAuditEvent = {
          kind: "llm.request.blocked",
          report: error.report,
        };
        await options.audit?.(event);
      }
      throw error;
    }

    const event: PrivacyAuditEvent = {
      kind: "llm.request.sanitized",
      report: scrubbed.report,
    };
    await options.audit?.(event);
    return options.transport(scrubbed.value);
  };
}

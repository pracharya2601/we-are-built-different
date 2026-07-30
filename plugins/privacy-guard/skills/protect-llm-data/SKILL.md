---
name: protect-llm-data
description: Add or audit a fail-closed privacy boundary around LLM and AI-provider calls. Use when a product sends account, customer, patient, member, beneficiary, workspace, uploaded-file, support, analytics, or other potentially personal data to an LLM; when prompts or traces may contain PII, credentials, or provider identifiers; or when integrating the privacy-guard runtime into another TypeScript product.
---

# Protect LLM Data

Keep raw personal data on the application side of the LLM boundary. Use the
plugin's provider-neutral TypeScript runtime in `../../src/` instead of
scattering regular expressions across provider adapters.

## Workflow

1. Locate every outbound AI boundary: SDK calls, HTTP calls, embeddings,
   moderation, tool traces, prompt logs, retries, queues, and error reporting.
2. Minimize the payload before scrubbing. Select only fields required for the
   stated purpose; do not pass whole account records, auth claims, uploads, or
   database rows.
3. Route the final request through `createPrivacySafeLlmGateway`. Keep provider
   clients private to that module so callers cannot bypass the gateway.
4. Add domain key rules or text detectors for product-specific identifiers.
   Use synthetic values in tests.
5. Verify that blocked requests never reach the provider and that telemetry
   contains only `PrivacyReport`, never prompts or matched values.
6. Document residual risk and configure the chosen provider's retention,
   training, residency, and access settings separately.

## Integration pattern

Import the package through the host product's package boundary. During local
development in this repository, import from
`plugins/privacy-guard/src/index.ts`.

```ts
const safeLlmCall = createPrivacySafeLlmGateway({
  transport: (request) => provider.responses.create(request),
  audit: (event) => audit.write(event),
});

const response = await safeLlmCall(minimalRequest);
```

Use the default `tokenize` mode for normal operation. Use `block` in audits,
high-risk workflows, or tests that must prove the upstream payload is already
clean. Credentials are dropped regardless of tokenization mode.

## Required controls

- Keep the gateway server-side and provider-neutral.
- Reject cyclic, non-plain, or over-deep input instead of serializing it
  optimistically.
- Never include raw matched values in findings, logs, thrown errors, metrics,
  or test names.
- Preserve workspace isolation locally. Do not use `workspaceId`, email, or an
  auth/provider ID as an LLM correlation key.
- Keep tokenization mappings request-local and irreversible outside the call.
- Scrub data before prompt caching, tracing, retry queues, and provider SDKs.
- Treat output logging as another privacy boundary and call `scrubForLlm`
  before recording model output.

## Limitations

Local detection cannot prove that arbitrary prose contains no names, rare
identifiers, or implicit sensitive facts. For free-form medical, financial,
legal, child, or identity data, add a domain detector or do not send the text.
This runtime complements—not replaces—consent, retention limits, encryption,
access control, deletion, incident response, and provider contract review.

# Privacy-safe LLM boundary

The product must treat every LLM or AI provider as an external data boundary.
Raw account, authentication, payment, participant, upload, support, and
workspace records must not cross that boundary.

## Architecture

Use `plugins/privacy-guard` as the only outbound path to an LLM provider:

```text
product feature
  -> purpose-specific field selection
  -> privacy-guard scan/tokenization
  -> metadata-only audit event
  -> provider adapter
  -> LLM provider
```

The guard is provider-neutral and has no runtime dependencies. It recursively
scans JSON-compatible requests, protects sensitive structured keys, detects
common identifiers in free text, removes credentials, and produces reports
that contain categories and object paths but never matched values.

```ts
import {
  createPrivacySafeLlmGateway,
} from "../plugins/privacy-guard/src/index.ts";

const callLlm = createPrivacySafeLlmGateway({
  transport: (request) => provider.responses.create(request),
  audit: (event) => auditRepository.write(event),
});

const response = await callLlm({
  model: selectedModel,
  input: purposeBuiltPrompt,
});
```

Keep the provider client private to the adapter module. Application features
must receive only the guarded function so they cannot call the provider
directly.

## Required product controls

- Define the purpose and minimum fields for each AI workflow.
- Do not send whole database rows, auth claims, raw uploaded files, payment
  objects, or internal tenant identifiers.
- Add custom detectors for domain identifiers and synthetic tests for each.
- Apply the guard before prompt caches, traces, queues, retries, error
  reporting, and provider SDK calls.
- Log only the returned `PrivacyReport`. Never log the input, output, detector
  match, token map, or provider request body.
- Run high-risk workflows in `block` mode until their upstream payload is
  proven clean.
- Apply the same scrubber before storing model output in logs or analytics.
- Configure provider retention, training, residency, subprocessors, and access
  controls before enabling a production workflow.
- Maintain workspace authorization before field selection. Scrubbing does not
  replace tenant isolation.

## Data handling modes

- `tokenize` is the default. It replaces a repeated value with a stable token
  inside one request and discards the in-memory mapping afterward.
- `redact` uses category-only markers with no per-request linkage.
- `block` throws `PrivacyGuardError` before the transport receives the request
  when any configured sensitive value is found.

Credentials are removed in `tokenize` and `redact` modes. Invalid detectors,
cyclic data, functions, symbols, bigints, class instances, excessive nesting,
and excessive findings fail closed.

## Residual risk

Pattern matching cannot guarantee that arbitrary prose contains no personal
name, rare identifier, sensitive inference, or novel address format. Do not
send free-form medical, financial, legal, child, identity, or similarly
high-risk content unless a domain-specific detector and workflow review cover
it. Privacy Guard complements consent, access control, encryption, retention
limits, deletion, incident response, and legal review; it does not replace
them.

## Reuse in another product

Copy or package the complete `plugins/privacy-guard` directory. The runtime
package is `@built-different/privacy-guard`, and the Codex plugin manifest and
`protect-llm-data` skill travel with it. Keep the package source behind the
other product's provider adapter and run its behavior tests with synthetic
fixtures before enabling any LLM workflow.

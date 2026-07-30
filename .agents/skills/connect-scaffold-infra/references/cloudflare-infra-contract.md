# Cloudflare infrastructure contract

Use this reference after auditing a scaffold and before editing its Cloudflare
configuration.

## Contract layers

Keep these layers distinct:

1. **Application contract**: binding names and types consumed by code.
2. **Repository contract**: worker entry point, compatibility settings,
   migration directory, environment definitions, and non-secret variables.
3. **Provider state**: Cloudflare account, database and namespace IDs, routes,
   deployed versions, secret values, and migration state.

A repository can fully describe layers 1 and 2 without proving layer 3 exists.
Verify provider state using an authenticated, read-only tool response.

## Discovery map

| Question | Likely evidence |
| --- | --- |
| What runs? | `package.json`, Worker entry point, framework config |
| Which bindings exist? | `Env` types, `cloudflare:workers` access, framework plugin config |
| Which resources are local-only? | Vite/Miniflare config, placeholder IDs, `.dev.vars` |
| Which resources are deployable? | `wrangler.jsonc`, `wrangler.json`, or `wrangler.toml` |
| Where do migrations come from? | Drizzle config, migration journal, package scripts |
| Which names are secrets? | `.env.example`, code access, operations docs |
| Which environments exist? | Wrangler environment blocks and deployment docs |
| Is another host authoritative? | host-specific metadata and repository instructions |

Treat provider IDs as opaque strings. Never derive or invent them.

## Binding mapping

Each application binding needs one stable name across:

- Worker environment types;
- application access such as `env.DB`;
- local emulation configuration;
- every deployable environment;
- tests or adapters that mock the binding.

Changing a binding name is an application interface change, not a cosmetic
configuration edit.

Common Cloudflare binding types include D1 databases, KV namespaces, R2 buckets,
Queues, Durable Objects, service bindings, Analytics Engine datasets, AI, and
plain variables. Add only types demonstrated by the scaffold or requested by the
user.

## Variables and secrets

Classify configuration before wiring it:

- **Safe repository configuration**: binding names, feature switches without
  sensitive values, migration paths, compatibility flags.
- **Provider-generated identifiers**: database IDs, namespace IDs, routes, and
  account-specific resource names. Store only where the chosen deployment model
  expects them.
- **Secrets**: API keys, client secrets, signing secrets, session keys, and
  tokens. Store local values only in ignored files and remote values only in the
  provider's secret manager.

An environment example should document names and safe placeholders, never usable
credentials.

## D1 and Drizzle

Use the Drizzle schema as the editable model and generated SQL as the migration
artifact when the scaffold already follows that convention.

For every schema change:

1. generate a new migration with the repository's pinned command;
2. inspect constraints, indexes, defaults, and destructive statements;
3. test the migration against an isolated local database;
4. preserve journal order;
5. back up remote data before destructive production changes;
6. apply staging before production;
7. verify remote migration state after application.

Never edit a migration already applied to any shared environment.

## Environment isolation

Development, staging, and production should not share stateful resources or
provider tenants unless the architecture explicitly requires it. Give each
environment explicit resource names and IDs. Keep the application-facing binding
names stable so environment selection changes configuration rather than code.

For a single-company control plane, also isolate Auth0 applications/tenants and
Stripe test/live configuration as documented by the repository.

## MCP boundary

An MCP server is useful when Codex repeatedly needs authenticated semantic
operations such as:

- list or inspect Workers and D1 databases;
- resolve names to provider-generated IDs;
- inspect deployments, logs, bindings, or migration state;
- create a scoped non-production resource;
- set a secret without exposing its value to repository files.

Keep the MCP surface narrow:

- separate read-only and mutating tools;
- require explicit account and environment arguments;
- return opaque IDs exactly as provided;
- redact secret values;
- make destructive operations unavailable or separately gated;
- provide dry-run or validation tools where Cloudflare supports them.

Do not build an MCP server just to run deterministic repository checks. Keep
those checks in scripts bundled with this skill.

---
name: connect-scaffold-infra
description: Connect an existing application scaffold to Cloudflare infrastructure safely and repeatably. Use when Codex needs to audit a scaffold's infrastructure gaps; configure Workers, vinext, D1, R2, KV, Queues, environment bindings, secrets, or per-environment Wrangler settings; prepare Drizzle/D1 migrations; separate local, staging, and production resources; verify a Cloudflare deployment path; or decide whether a live Cloudflare MCP/tool integration is warranted.
---

# Connect Scaffold Infrastructure

Turn an application scaffold into an explicit, verifiable Cloudflare
infrastructure contract. Preserve the application's architecture and keep live
resource operations separate from repository configuration.

## Start with discovery

1. Read the nearest `AGENTS.md`, repository status, main README, package
   manifest, runtime configuration, environment example, database configuration,
   worker entry point, and operations documentation.
2. Run the bundled read-only audit:

   ```bash
   node <skill-directory>/scripts/audit-scaffold.mjs <project-root>
   ```

   Add `--json` when structured output is more useful.
3. Read [references/cloudflare-infra-contract.md](references/cloudflare-infra-contract.md)
   before creating or changing Cloudflare configuration.
4. Distinguish existing user changes from infrastructure work. Do not overwrite,
   revert, or reformat unrelated changes.
5. State the discovered contract: runtime, entry point, bindings, data stores,
   migration source, environment names, secret names, and missing pieces.

Do not treat a framework's local emulation configuration as proof that remote
infrastructure exists. Placeholder resource IDs are local-only until verified.

## Choose the operation level

Use the smallest level that satisfies the request:

1. **Audit**: inspect files and report gaps; make no changes.
2. **Prepare**: edit repository configuration and documentation; create no
   remote resources.
3. **Provision**: create or change explicitly scoped development or staging
   resources with an available Cloudflare tool, MCP server, or Wrangler.
4. **Release**: apply remote migrations, set secrets, or deploy an explicitly
   named environment.

Treat provisioning and release as live mutations. Confirm the account,
environment, resource names, and intended operation before executing them.
Never infer that “connect” authorizes a production deployment.

## Design the contract

Build an environment matrix before editing:

| Concern | Local | Staging | Production |
| --- | --- | --- | --- |
| Worker name | explicit | explicit | explicit |
| D1/KV/R2/Queue resources | emulated or local | isolated IDs | isolated IDs |
| non-secret variables | local values | environment config | environment config |
| secrets | ignored local file | secret manager | secret manager |
| migrations | generated and tested | apply after review | backup, review, apply |

Keep binding names identical across code and environments. Keep resource IDs,
account identifiers, routes, and provider-generated values out of reusable
templates until discovered from an authoritative tool response.

For this repository, obey its own architecture rules before generic Cloudflare
patterns. In particular, preserve stable internal IDs, provider boundaries,
fail-closed access, webhook idempotency, and demo-mode labeling.

## Implement repository wiring

1. Prefer the repository's existing Cloudflare configuration format. Do not
   introduce a second competing configuration file.
2. Add only bindings used by application code. Update runtime types when
   bindings change.
3. Separate plain configuration from secrets:
   - commit safe variable names and examples;
   - keep local secret values in ignored files;
   - use the hosting secret manager for remote values;
   - never print, read back, or commit secret values.
4. Keep Drizzle schema and generated migrations aligned. Never rewrite an
   applied migration; generate a new migration and review its SQL.
5. Add package commands only when they encode a stable, repeated operation.
   When commands change, update `AGENTS.md` and the main README in the same
   change if the repository requires it.
6. Add operational notes for environment selection, migration order, rollback,
   and verification when the repository lacks them.
7. Do not add deployment metadata for another hosting system unless that system
   is already selected and its required workflow is active.

## Use live tools safely

Prefer a purpose-built Cloudflare connector or MCP tool when one is already
available and authenticated. Otherwise use the project's pinned Wrangler
version. Do not install or authenticate tools merely to complete a plan-only or
repository-only request.

Before a mutation:

- run a read-only identity/account check;
- list or inspect the exact target when possible;
- use explicit environment and resource names;
- present the command or tool operation and its effect;
- obtain approval when the operation creates, changes, migrates, deploys, or
  deletes remote state.

Record returned resource IDs only in the appropriate environment configuration.
Never fabricate IDs. Refuse broad destructive targets and never delete, replace,
or restore infrastructure without a separately explicit request.

## Verify in layers

Run the narrowest relevant checks first, then the repository's full verification
commands:

1. Re-run `audit-scaffold.mjs` and resolve unexpected warnings.
2. Validate configuration using the pinned Cloudflare tooling without deploying.
3. Generate runtime binding types when the project uses generated types.
4. Run typecheck, deterministic tests, lint, and production build.
5. For local data changes, apply migrations to an isolated local database and
   exercise the affected route or service.
6. For a remote environment, verify bindings and migration state through
   read-only inspection after any approved mutation.

Do not claim a remote environment is connected based only on a successful local
build.

## Hand off

Report:

- the resulting scaffold-to-infrastructure mapping;
- files changed;
- checks run and their results;
- remote operations performed, if any;
- unresolved placeholders or values the operator must supply;
- the exact next safe operation.

If recurring work requires live Cloudflare inventory, logs, secrets, or
deployments, recommend a thin MCP integration that exposes those operations.
Keep orchestration, policy, and repository conventions in this skill rather
than duplicating them in the MCP server.

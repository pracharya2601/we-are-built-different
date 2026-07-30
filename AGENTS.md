# Repository Guidelines

## Project Structure & Module Organization

This repository is a full-stack SaaS control plane built with vinext,
TypeScript, Cloudflare D1, and Drizzle. It supports tenant workspaces and runs
on localhost until a production host is deliberately selected.

- `app/` contains pages and route handlers.
- `config/company.json` contains editable, non-secret company settings.
- `lib/` contains auth, billing, data, and event modules.
- `db/` and `drizzle/` contain the schema and migrations.
- `tests/` contains Node-based service and contract tests.
- `docs/` contains architecture and operational notes.

Prefer small, cohesive modules. Do not commit generated output, dependencies,
credentials, or editor files.

## Build, Test, and Development Commands

Use npm and the committed lockfile:

- `npm run db:migrate:local`: apply pending D1 migrations locally.
- `npm run dev`: start the local vinext/Cloudflare development runtime.
- `npm run typecheck`: validate strict TypeScript types.
- `npm test`: run service and contract tests.
- `npm run lint`: run ESLint.
- `npm run build`: create the production Worker artifact.
- `npm run db:generate`: generate SQL after schema changes.
- `npm run db:migrations:list:staging`: inspect unapplied staging D1 migrations.
- `npm run db:migrate:staging`: apply reviewed migrations to staging D1.
- `npm run deploy:staging:dry-run`: validate staging deployment preparation.
- `npm run deploy:staging`: build and deploy the staging Worker.
- `npm run stripe:listen`: forward subscription events from the Stripe sandbox.

## Coding Style & Naming Conventions

Use two-space indentation, strict TypeScript, ESLint, UTF-8 files, and final
newlines. Use `PascalCase` for components/types, `camelCase` for
functions/variables, and `kebab-case` for general file names. Keep provider code
behind `lib/auth` and `lib/billing`; application code must use stable internal
IDs rather than Auth0 or Stripe IDs. Read branding, feature flags, and workspace
defaults through `lib/config`, never by importing JSON ad hoc.
Follow `docs/multi-user-collaboration.md` for tenant-owned product data: every
project query, event, cache key, and storage object must retain `workspaceId`.

## Testing Guidelines

Add tests for behavior changes and bug fixes. Name tests after observable
behavior, such as `stripe-webhook.test.mjs`. Tests must be deterministic and
must not contact Auth0 or Stripe. Cover tenant isolation, permission denial,
signature rejection, duplicate events, and entitlement transitions.

## Commit & Pull Request Guidelines

Use concise, imperative subjects such as `Add webhook deduplication`. Keep
commits focused. Pull requests must explain the change, list verification, and
link issues. Include screenshots for UI changes and call out migrations or
webhook changes.

## Security & Configuration

Never commit secrets. Keep `.env.example` aligned with runtime configuration;
use `.env.local` locally and a reviewed secret manager after a host is chosen.
Do not add ChatGPT/Sites deployment metadata or fake authentication/payment
fallbacks. Preserve tenant isolation and fail-closed membership checks.

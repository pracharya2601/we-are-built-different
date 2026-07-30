# Repository Guidelines

## Project Structure & Module Organization

This repository is a full-stack SaaS control plane built with vinext, TypeScript, Cloudflare D1, and Drizzle. Keep the root focused on project configuration and documentation:

- `app/` contains pages and route handlers.
- `lib/` contains auth, billing, data, and event modules.
- `db/` and `drizzle/` contain the schema and migrations.
- `tests/` contains Node-based service and contract tests.
- `docs/` contains architecture and operational notes.

Prefer small, cohesive modules. Avoid placing generated output, dependencies, credentials, or editor-specific files under version control.

## Build, Test, and Development Commands

Use npm and the committed lockfile:

- `npm run dev`: start the local vinext/Cloudflare development runtime.
- `npm run typecheck`: validate strict TypeScript types.
- `npm test`: run service and contract tests.
- `npm run lint`: run ESLint.
- `npm run build`: create the production Worker artifact.
- `npm run db:generate`: generate SQL after schema changes.

Update this file and the main README in the same change that adds or modifies these commands.

## Coding Style & Naming Conventions

Use two-space indentation, strict TypeScript, ESLint, UTF-8 files, and final newlines. Use `PascalCase` for components/types, `camelCase` for functions/variables, and `kebab-case` for general file names. Keep provider code behind `lib/auth` and `lib/billing`; application code must use stable internal IDs rather than Auth0 or Stripe IDs.

## Testing Guidelines

Add tests with every behavior change and bug fix. Name tests after observable behavior, such as `stripe-webhook.test.mjs`. Tests must be deterministic and must not contact Auth0 or Stripe. Cover signature rejection, duplicate events, tenant isolation, permission denial, and entitlement transitions.

## Commit & Pull Request Guidelines

Use concise, imperative commit subjects such as `Add webhook deduplication`. Keep each commit logically focused. Pull requests must explain the problem and solution, list verification performed, and link relevant issues. Include screenshots for visible UI changes and call out environment, migration, or webhook changes.

## Security & Configuration

Never commit secrets. Keep `.env.example` aligned with runtime configuration and store production values in the hosting secret manager. Demo mode must be visibly labeled and must never simulate a completed live payment.

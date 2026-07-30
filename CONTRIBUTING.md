# Contributing to OpenChair

Start with the [module contributor guide](docs/modules/README.md). It explains
the repository boundaries, current implementation status, and which module
guide to read before making changes.

## First local checkout

```bash
npm ci
cp .env.example .env.local
npm run db:migrate:local
npm test
npm run dev
```

Provider-backed features fail closed. Add only the local secrets needed by the
module you are working on; never commit `.env.local` or copy another
environment's credentials.

## Required checks

Before handing off a change, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

If `db/schema.ts` changes, generate and review a new migration:

```bash
npm run db:generate
npm run db:migrate:local
```

Never edit an applied migration. Do not apply staging migrations, provision
remote infrastructure, upload secrets, or deploy unless that external change
is explicitly approved.

## Pull-request handoff

Include:

- the module and actor journey affected;
- changed public types, commands, events, routes, tables, or environment names;
- authorization and `workspaceId` checks;
- migration and webhook impact;
- tests run and provider behavior intentionally mocked;
- screenshots for visible UI changes;
- known limitations and the next module dependency.

Keep changes inside one module where practical. When a shared contract must
change, update the contract and every consumer in the same pull request.

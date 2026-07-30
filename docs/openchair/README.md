# OpenChair MVP scaffold

This directory is the implementation contract for the first OpenChair vertical
slice. The scaffold deliberately favors putting the complete workflow together
inside the existing vinext Cloudflare Worker before extracting independently
deployed services.

## Documents

- [Architecture](architecture.md)
- [Workflow contract](workflow-contract.md)
- [Implementation plan](implementation-plan.md)
- [Contributor module index](../modules/README.md)
- [Product roles and journeys](../modules/product-roles.md)

## Current boundary

The OpenChair product modules live under `lib/openchair`. They share one
Cloudflare Worker and one D1 database, but communicate through typed contracts
and provider ports so they can be separated later.

The existing generic `lib/calls` package owns Vapi transport, webhook
authentication, encrypted call data, and generic call jobs. OpenChair outreach
will adapt candidates and appointment context to that package; it must not
duplicate the Vapi client.

Fixture scenarios live in `fixtures/openchair`. They are synthetic presentation
data only. They must never be interpreted as authenticated users, verified
Stripe payments, or real call results.

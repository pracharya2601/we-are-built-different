-- Local development seed: restores the "built-different" nonprofit workspace
-- and attaches it to the real Auth0 identity for pracharya2601@gmail.com.
--
-- Run with:
--   npx wrangler d1 execute built-different-local --local --file fixtures/seed-built-different.sql
--
-- This does NOT create a session or bypass authentication. It only pre-creates
-- the D1 rows that a first Auth0 login would otherwise create. Identity lookup
-- is by (issuer, subject) in findIdentityBySubject, so signing in through Auth0
-- with this Google account matches the seeded identity, reuses the same user id,
-- and resolves to this workspace instead of provisioning a new one.
--
-- Every statement is idempotent; re-running after a local D1 reset is safe.

INSERT INTO users (id, display_name, primary_email, status, created_at, updated_at)
VALUES (
  'usr_ea27731d301c4799af951adc8d1e0095',
  NULL,
  'pracharya2601@gmail.com',
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
)
ON CONFLICT(id) DO NOTHING;

-- issuer and subject must match the Auth0 ID token exactly, or the login will
-- create a second user rather than reusing this one.
INSERT INTO identities (
  id, user_id, issuer, subject, email, email_verified,
  last_seen_at, created_at, updated_at
)
VALUES (
  'idn_5c0f1a7d2b3e4f6a8c9d0e1f2a3b4c5d',
  'usr_ea27731d301c4799af951adc8d1e0095',
  'https://built-different.us.auth0.com/',
  'google-oauth2|104410721545255631665',
  'pracharya2601@gmail.com',
  1,
  unixepoch() * 1000,
  unixepoch() * 1000,
  unixepoch() * 1000
)
ON CONFLICT(issuer, subject) DO NOTHING;

INSERT INTO workspaces (
  id, name, slug, auth0_organization_id, status,
  workspace_type, account_type, created_at, updated_at
)
VALUES (
  'wsp_4668907b717c43c9b861b7b015121b60',
  'Built Different',
  'built-different',
  NULL,
  'active',
  'team',
  'nonprofit',
  unixepoch() * 1000,
  unixepoch() * 1000
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO memberships (
  workspace_id, user_id, role, status, joined_at, created_at, updated_at
)
VALUES (
  'wsp_4668907b717c43c9b861b7b015121b60',
  'usr_ea27731d301c4799af951adc8d1e0095',
  'owner',
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000,
  unixepoch() * 1000
)
ON CONFLICT(workspace_id, user_id) DO NOTHING;

-- platform_operators is deliberately omitted: bootstrapPlatformOwner grants it
-- during the real login because this address is in access.bootstrapOwnerEmails.

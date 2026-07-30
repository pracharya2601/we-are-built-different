import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import { identities, users } from "../../db/schema";
import { createId } from "./ids";

export type IdentityInput = {
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
};

export async function findIdentityBySubject(
  db: AppDatabase,
  issuer: string,
  subject: string,
) {
  return (
    (await db
      .select()
      .from(identities)
      .where(
        and(eq(identities.issuer, issuer), eq(identities.subject, subject)),
      )
      .limit(1))[0] ?? null
  );
}

export async function touchIdentity(
  db: AppDatabase,
  identityId: string,
  input: Pick<IdentityInput, "email" | "emailVerified">,
) {
  const now = new Date();
  return (
    (await db
      .update(identities)
      .set({
        email: input.email,
        emailVerified: input.emailVerified ?? false,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(identities.id, identityId))
      .returning())[0] ?? null
  );
}

export async function resolveOrCreateUserIdentity(
  db: AppDatabase,
  input: IdentityInput,
) {
  const existing = await findIdentityBySubject(
    db,
    input.issuer,
    input.subject,
  );
  if (existing) {
    await touchIdentity(db, existing.id, input);
    return { userId: existing.userId, identityId: existing.id, created: false };
  }

  const now = new Date();
  const userId = createId("usr");
  const identityId = createId("idn");

  await db.batch([
    db.insert(users).values({
      id: userId,
      displayName: input.displayName ?? null,
      primaryEmail: input.email,
      createdAt: now,
      updatedAt: now,
    }),
    db
      .insert(identities)
      .values({
        id: identityId,
        userId,
        issuer: input.issuer,
        subject: input.subject,
        email: input.email,
        emailVerified: input.emailVerified ?? false,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [identities.issuer, identities.subject],
      }),
  ]);

  const resolved = await findIdentityBySubject(
    db,
    input.issuer,
    input.subject,
  );
  if (!resolved) {
    throw new Error("Identity provisioning did not produce a readable identity");
  }

  return {
    userId: resolved.userId,
    identityId: resolved.id,
    created: resolved.id === identityId,
  };
}


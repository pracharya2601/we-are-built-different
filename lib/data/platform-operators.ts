import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import { identities, platformOperators } from "../../db/schema";
import { canBootstrapCompany } from "../config";

export async function bootstrapPlatformOwner(
  db: AppDatabase,
  input: {
    userId: string;
    email: string | null;
    emailVerified: boolean;
  },
): Promise<boolean> {
  if (!input.emailVerified || !canBootstrapCompany(input.email)) return false;

  const [operator] = await db
    .insert(platformOperators)
    .values({
      userId: input.userId,
      role: "platform_owner",
      status: "active",
    })
    .onConflictDoNothing({ target: platformOperators.userId })
    .returning({ userId: platformOperators.userId });
  return Boolean(operator);
}

export async function isPlatformOwner(
  db: AppDatabase,
  userId: string,
): Promise<boolean> {
  const [operator] = await db
    .select({ userId: platformOperators.userId })
    .from(platformOperators)
    .where(
      and(
        eq(platformOperators.userId, userId),
        eq(platformOperators.role, "platform_owner"),
        eq(platformOperators.status, "active"),
      ),
    )
    .limit(1);
  return Boolean(operator);
}

export async function bootstrapPlatformOwnerFromVerifiedIdentity(
  db: AppDatabase,
  userId: string,
): Promise<boolean> {
  const storedIdentities = await db
    .select({
      email: identities.email,
      emailVerified: identities.emailVerified,
    })
    .from(identities)
    .where(
      and(
        eq(identities.userId, userId),
        eq(identities.emailVerified, true),
      ),
    );
  const eligible = storedIdentities.find((identity) =>
    canBootstrapCompany(identity.email),
  );
  if (!eligible) return false;
  return bootstrapPlatformOwner(db, {
    userId,
    email: eligible.email,
    emailVerified: true,
  });
}

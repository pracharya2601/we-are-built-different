import { and, asc, eq } from "drizzle-orm";

import type { AppDatabase } from "../../db";
import {
  financialAccounts,
  financialLedgerEntries,
  financialTransactions,
  fundingPools,
  participantRoles,
} from "../../db/schema";
import { createId } from "../data/ids";
import { buildLedgerLines, normalizeCurrency, validateAmount } from "./ledger";
import type {
  MoneyFlowKind,
  ParticipantRole,
} from "./types";

const ACCOUNT_DEFINITIONS = [
  { key: "cash", accountType: "asset" },
  { key: "available", accountType: "liability" },
  { key: "beneficiary_allocated", accountType: "liability" },
] as const;

export async function createFundingPool(
  db: AppDatabase,
  input: {
    workspaceId: string;
    name: string;
    currency: string;
    createdByUserId: string;
  },
) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) {
    throw new Error("Funding pool names must contain 2 to 100 characters.");
  }
  const currency = normalizeCurrency(input.currency);
  const poolId = createId("pool");
  const now = new Date();
  await db.batch([
    db.insert(fundingPools).values({
      id: poolId,
      workspaceId: input.workspaceId,
      name,
      currency,
      status: "open",
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    }),
    ...ACCOUNT_DEFINITIONS.map((definition) =>
      db.insert(financialAccounts).values({
        id: createId("acct"),
        workspaceId: input.workspaceId,
        poolId,
        key: definition.key,
        accountType: definition.accountType,
        currency,
        createdAt: now,
        updatedAt: now,
      }),
    ),
  ]);
  return { id: poolId, name, currency, status: "open" as const };
}

export async function setParticipantRole(
  db: AppDatabase,
  input: {
    workspaceId: string;
    userId: string;
    role: ParticipantRole;
    status?: "active" | "suspended";
  },
) {
  const now = new Date();
  const [record] = await db
    .insert(participantRoles)
    .values({
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        participantRoles.workspaceId,
        participantRoles.userId,
        participantRoles.role,
      ],
      set: {
        status: input.status ?? "active",
        updatedAt: now,
      },
    })
    .returning();
  return record;
}

export async function listParticipantRoles(
  db: AppDatabase,
  workspaceId: string,
) {
  return db
    .select()
    .from(participantRoles)
    .where(eq(participantRoles.workspaceId, workspaceId))
    .orderBy(asc(participantRoles.userId), asc(participantRoles.role));
}

export async function listFundingPools(
  db: AppDatabase,
  workspaceId: string,
) {
  return db
    .select()
    .from(fundingPools)
    .where(eq(fundingPools.workspaceId, workspaceId))
    .orderBy(asc(fundingPools.name));
}

export async function listFinancialTransactions(
  db: AppDatabase,
  workspaceId: string,
  poolId?: string,
) {
  return db
    .select()
    .from(financialTransactions)
    .where(
      poolId
        ? and(
            eq(financialTransactions.workspaceId, workspaceId),
            eq(financialTransactions.poolId, poolId),
          )
        : eq(financialTransactions.workspaceId, workspaceId),
    )
    .orderBy(asc(financialTransactions.occurredAt));
}

export async function recordPostedMoneyFlow(
  db: AppDatabase,
  input: {
    workspaceId: string;
    poolId: string;
    kind: MoneyFlowKind;
    amount: number;
    currency: string;
    benefactorUserId?: string | null;
    beneficiaryUserId?: string | null;
    serviceProviderUserId?: string | null;
    provider: "stripe" | "manual";
    providerPaymentId?: string | null;
    providerTransferId?: string | null;
    idempotencyKey: string;
    memo?: string | null;
    createdByUserId: string;
    occurredAt?: Date;
  },
) {
  const existing = (
    await db
      .select()
      .from(financialTransactions)
      .where(
        and(
          eq(financialTransactions.workspaceId, input.workspaceId),
          eq(financialTransactions.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
  )[0];
  if (existing) {
    if (
      existing.poolId !== input.poolId ||
      existing.kind !== input.kind ||
      existing.amount !== input.amount
    ) {
      throw new Error("The idempotency key was reused for another transaction.");
    }
    return existing;
  }

  const pool = (
    await db
      .select()
      .from(fundingPools)
      .where(
        and(
          eq(fundingPools.id, input.poolId),
          eq(fundingPools.workspaceId, input.workspaceId),
          eq(fundingPools.status, "open"),
        ),
      )
      .limit(1)
  )[0];
  if (!pool) throw new Error("An open funding pool is required.");

  const currency = normalizeCurrency(input.currency);
  const amount = validateAmount(input.amount);
  if (currency !== pool.currency) {
    throw new Error("Transaction currency must match the funding pool.");
  }
  await requireParticipantRoles(db, input);

  const lines = buildLedgerLines({ ...input, amount, currency });
  const accounts = await db
    .select()
    .from(financialAccounts)
    .where(
      and(
        eq(financialAccounts.poolId, input.poolId),
        eq(financialAccounts.status, "active"),
      ),
    );
  const accountsByKey = new Map(
    accounts.map((account) => [account.key, account]),
  );
  const now = new Date();
  const transactionId = createId("txn");
  const occurredAt = input.occurredAt ?? now;
  await db.batch([
    db.insert(financialTransactions).values({
      id: transactionId,
      workspaceId: input.workspaceId,
      poolId: input.poolId,
      kind: input.kind,
      status: "posted",
      amount,
      currency,
      benefactorUserId: input.benefactorUserId ?? null,
      beneficiaryUserId: input.beneficiaryUserId ?? null,
      serviceProviderUserId: input.serviceProviderUserId ?? null,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId ?? null,
      providerTransferId: input.providerTransferId ?? null,
      idempotencyKey: input.idempotencyKey,
      memo: input.memo?.trim() || null,
      occurredAt,
      postedAt: now,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    }),
    ...lines.map((line) => {
      const account = accountsByKey.get(line.accountKey);
      if (!account) {
        throw new Error(`Funding pool account ${line.accountKey} is missing.`);
      }
      return db.insert(financialLedgerEntries).values({
        id: createId("entry"),
        transactionId,
        accountId: account.id,
        direction: line.direction,
        amount: line.amount,
        createdAt: now,
      });
    }),
  ]);
  return (
    (await db
      .select()
      .from(financialTransactions)
      .where(eq(financialTransactions.id, transactionId))
      .limit(1))[0] ?? null
  );
}

async function requireParticipantRoles(
  db: AppDatabase,
  input: {
    workspaceId: string;
    kind: MoneyFlowKind;
    benefactorUserId?: string | null;
    beneficiaryUserId?: string | null;
    serviceProviderUserId?: string | null;
  },
) {
  const requirements: Array<[string | null | undefined, ParticipantRole]> = [];
  if (input.kind === "benefactor_deposit") {
    requirements.push([input.benefactorUserId, "benefactor"]);
  }
  if (input.kind === "beneficiary_allocation") {
    requirements.push([input.beneficiaryUserId, "beneficiary"]);
  }
  if (input.kind === "service_provider_payment") {
    requirements.push([input.serviceProviderUserId, "service_provider"]);
    if (input.beneficiaryUserId) {
      requirements.push([input.beneficiaryUserId, "beneficiary"]);
    }
  }

  for (const [userId, role] of requirements) {
    if (!userId) continue;
    const record = (
      await db
        .select()
        .from(participantRoles)
        .where(
          and(
            eq(participantRoles.workspaceId, input.workspaceId),
            eq(participantRoles.userId, userId),
            eq(participantRoles.role, role),
            eq(participantRoles.status, "active"),
          ),
        )
        .limit(1)
    )[0];
    if (!record) {
      throw new Error(`An active ${role} participant role is required.`);
    }
  }
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FinanceValidationError,
  assertBalanced,
  buildLedgerLines,
} from "../lib/finance/ledger.ts";

test("benefactor deposits create balanced pool entries", () => {
  assert.deepEqual(
    buildLedgerLines({
      kind: "benefactor_deposit",
      amount: 5_000,
      currency: "usd",
      benefactorUserId: "usr_benefactor",
    }),
    [
      { accountKey: "cash", direction: "debit", amount: 5_000 },
      { accountKey: "available", direction: "credit", amount: 5_000 },
    ],
  );
});

test("beneficiary allocations and provider payments stay balanced", () => {
  assert.deepEqual(
    buildLedgerLines({
      kind: "beneficiary_allocation",
      amount: 2_000,
      currency: "USD",
      beneficiaryUserId: "usr_beneficiary",
    }),
    [
      { accountKey: "available", direction: "debit", amount: 2_000 },
      {
        accountKey: "beneficiary_allocated",
        direction: "credit",
        amount: 2_000,
      },
    ],
  );
  assert.deepEqual(
    buildLedgerLines({
      kind: "service_provider_payment",
      amount: 2_000,
      currency: "USD",
      beneficiaryUserId: "usr_beneficiary",
      serviceProviderUserId: "usr_provider",
    }),
    [
      {
        accountKey: "beneficiary_allocated",
        direction: "debit",
        amount: 2_000,
      },
      { accountKey: "cash", direction: "credit", amount: 2_000 },
    ],
  );
});

test("financial postings reject missing parties and unbalanced entries", () => {
  assert.throws(
    () =>
      buildLedgerLines({
        kind: "benefactor_deposit",
        amount: 100,
        currency: "USD",
      }),
    (error) =>
      error instanceof FinanceValidationError &&
      error.code === "benefactor_required",
  );
  assert.throws(
    () =>
      assertBalanced([
        { accountKey: "cash", direction: "debit", amount: 100 },
        { accountKey: "available", direction: "credit", amount: 90 },
      ]),
    (error) =>
      error instanceof FinanceValidationError &&
      error.code === "unbalanced_transaction",
  );
});

test("posted money records are isolated from browser write routes", async () => {
  const [repository, financeDocs] = await Promise.all([
    readFile(
      new URL("../lib/finance/repository.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../docs/funds-and-participants.md", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(repository, /idempotencyKey/);
  assert.match(repository, /db\.batch/);
  assert.match(repository, /requireParticipantRoles/);
  assert.match(financeDocs, /no browser endpoint that marks money as\s+posted/i);
  assert.match(financeDocs, /Stripe Connect/);
});

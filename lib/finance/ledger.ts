import type { LedgerLine, MoneyFlow } from "./types";

export class FinanceValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FinanceValidationError";
    this.code = code;
  }
}

export function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new FinanceValidationError(
      "invalid_currency",
      "Currency must be a three-letter ISO code.",
    );
  }
  return currency;
}

export function validateAmount(amount: number): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new FinanceValidationError(
      "invalid_amount",
      "Amount must be a positive integer in the currency's minor unit.",
    );
  }
  return amount;
}

export function buildLedgerLines(flow: MoneyFlow): LedgerLine[] {
  const amount = validateAmount(flow.amount);
  normalizeCurrency(flow.currency);

  let lines: LedgerLine[];
  switch (flow.kind) {
    case "benefactor_deposit":
      requireParty(
        flow.benefactorUserId,
        "benefactor_required",
        "A benefactor is required for a deposit.",
      );
      lines = [
        { accountKey: "cash", direction: "debit", amount },
        { accountKey: "available", direction: "credit", amount },
      ];
      break;
    case "beneficiary_allocation":
      requireParty(
        flow.beneficiaryUserId,
        "beneficiary_required",
        "A beneficiary is required for an allocation.",
      );
      lines = [
        { accountKey: "available", direction: "debit", amount },
        {
          accountKey: "beneficiary_allocated",
          direction: "credit",
          amount,
        },
      ];
      break;
    case "service_provider_payment":
      requireParty(
        flow.serviceProviderUserId,
        "service_provider_required",
        "A service provider is required for a provider payment.",
      );
      lines = [
        {
          accountKey: flow.beneficiaryUserId
            ? "beneficiary_allocated"
            : "available",
          direction: "debit",
          amount,
        },
        { accountKey: "cash", direction: "credit", amount },
      ];
      break;
    default:
      throw new FinanceValidationError(
        "unsupported_money_flow",
        "The money flow kind is not supported.",
      );
  }
  assertBalanced(lines);
  return lines;
}

export function assertBalanced(lines: readonly LedgerLine[]): void {
  const totals = lines.reduce(
    (sum, line) => {
      sum[line.direction] += validateAmount(line.amount);
      return sum;
    },
    { debit: 0, credit: 0 },
  );
  if (totals.debit !== totals.credit) {
    throw new FinanceValidationError(
      "unbalanced_transaction",
      "Ledger debits and credits must balance.",
    );
  }
}

function requireParty(
  value: string | null | undefined,
  code: string,
  message: string,
): asserts value is string {
  if (!value) throw new FinanceValidationError(code, message);
}

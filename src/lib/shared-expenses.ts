export const EXPENSES_KEY = "roam.shared-expenses.v1";

export type Traveller = { id: string; name: string };
export type SharedExpense = {
  id: string;
  title: string;
  amount: number;
  payerId: string;
  splitAmong: string[];
};
export type Ledger = {
  currency: string;
  travellers: Traveller[];
  expenses: SharedExpense[];
};
export type Ledgers = Record<string, Ledger>;
export type Repayment = { from: string; to: string; amount: number };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function currencyDigits(currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function parseMoney(value: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const pattern = digits === 0
    ? /^\d+$/
    : new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(value.trim())) return null;
  const amount = Math.round(Number(value.trim()) * 10 ** digits);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000_000_000
    ? amount
    : null;
}

export function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amount / 10 ** currencyDigits(currency));
}

export function readLedger(value: unknown): Ledger {
  if (!isObject(value) || typeof value.currency !== "string" ||
      !Array.isArray(value.travellers) || !Array.isArray(value.expenses)) {
    throw new Error("The shared-expense ledger couldn’t be read.");
  }
  currencyDigits(value.currency);
  if (value.travellers.length > 30 || value.expenses.length > 1000) {
    throw new Error("This ledger exceeds the current limit of 30 travellers or 1,000 expenses.");
  }
  const travellers = value.travellers.map((person): Traveller => {
    if (!isObject(person) || typeof person.id !== "string" ||
        typeof person.name !== "string" || !person.name.trim() || person.name.length > 60) {
      throw new Error("A traveller couldn’t be read.");
    }
    return { id: person.id, name: person.name };
  });
  const travellerIds = new Set(travellers.map((person) => person.id));
  if (travellerIds.size !== travellers.length) throw new Error("Duplicate traveller IDs.");
  const expenses = value.expenses.map((expense): SharedExpense => {
    if (!isObject(expense) || typeof expense.id !== "string" ||
        typeof expense.title !== "string" || !expense.title.trim() || expense.title.length > 150 ||
        !Number.isSafeInteger(expense.amount) || Number(expense.amount) <= 0 ||
        Number(expense.amount) > 1_000_000_000_000 ||
        typeof expense.payerId !== "string" || !travellerIds.has(expense.payerId) ||
        !Array.isArray(expense.splitAmong) || expense.splitAmong.length === 0 ||
        !expense.splitAmong.every((id) => typeof id === "string" && travellerIds.has(id)) ||
        new Set(expense.splitAmong).size !== expense.splitAmong.length) {
      throw new Error("A shared expense couldn’t be read.");
    }
    return {
      id: expense.id, title: expense.title, amount: Number(expense.amount),
      payerId: expense.payerId, splitAmong: expense.splitAmong as string[],
    };
  });
  if (new Set(expenses.map((expense) => expense.id)).size !== expenses.length) {
    throw new Error("Duplicate expense IDs.");
  }
  return { currency: value.currency, travellers, expenses };
}

export function readLedgers(value: unknown): Ledgers {
  if (!isObject(value)) throw new Error("Your shared expenses couldn’t be read.");
  return Object.fromEntries(Object.entries(value).map(([id, ledger]) => [id, readLedger(ledger)]));
}

export function splitExpense(expense: SharedExpense) {
  const base = Math.floor(expense.amount / expense.splitAmong.length);
  const remainder = expense.amount % expense.splitAmong.length;
  return expense.splitAmong.map((id, index) => ({
    id, amount: base + (index < remainder ? 1 : 0),
  }));
}

export function calculateBalances(ledger: Ledger) {
  const balances = Object.fromEntries(ledger.travellers.map((person) => [person.id, 0]));
  for (const expense of ledger.expenses) {
    balances[expense.payerId] += expense.amount;
    for (const share of splitExpense(expense)) balances[share.id] -= share.amount;
  }
  return balances;
}

export function suggestRepayments(balances: Record<string, number>): Repayment[] {
  const creditors = Object.entries(balances).filter(([, value]) => value > 0)
    .map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances).filter(([, value]) => value < 0)
    .map(([id, amount]) => ({ id, amount: -amount })).sort((a, b) => b.amount - a.amount);
  const repayments: Repayment[] = [];
  let creditor = 0;
  let debtor = 0;
  while (creditor < creditors.length && debtor < debtors.length) {
    const amount = Math.min(creditors[creditor].amount, debtors[debtor].amount);
    repayments.push({ from: debtors[debtor].id, to: creditors[creditor].id, amount });
    creditors[creditor].amount -= amount;
    debtors[debtor].amount -= amount;
    if (creditors[creditor].amount === 0) creditor += 1;
    if (debtors[debtor].amount === 0) debtor += 1;
  }
  return repayments;
}

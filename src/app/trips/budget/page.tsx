"use client";

import { accountStorage as localStorage } from "@/lib/account-storage";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Trip = {
  id: string;
  name: string;
  currency: string;
};

type ActivityEstimate = {
  id: string;
  title: string;
  day: number;
  cost: number;
};

type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
};

type Budget = {
  currency: string;
  target: number | null;
  expenses: Expense[];
};

type Budgets = Record<string, Budget>;
type ActivityEstimates = Record<string, ActivityEstimate[]>;

const TRIPS_KEY = "roam.trips.v1";
const PLANS_KEY = "roam.plans.v1";
const BUDGETS_KEY = "roam.budgets.v1";

const categories = [
  "Accommodation",
  "Transport",
  "Food",
  "Shopping",
  "Other",
];

const inputStyles =
  "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function currencyDigits(currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits ?? 2;
}

function currencyFactor(currency: string) {
  return 10 ** currencyDigits(currency);
}

// Store budget amounts in minor units: for example, 1250 = £12.50.
function parseAmount(value: string, currency: string) {
  const trimmed = value.trim();
  const digits = currencyDigits(currency);
  const pattern = digits === 0
    ? /^\d+$/
    : new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);

  if (!pattern.test(trimmed)) return null;

  const minor = Math.round(Number(trimmed) * currencyFactor(currency));

  return Number.isSafeInteger(minor) && minor >= 0 && minor <= 1_000_000_000_000
    ? minor
    : null;
}

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(minor / currencyFactor(currency));
}

function amountInput(minor: number, currency: string) {
  return (minor / currencyFactor(currency)).toFixed(currencyDigits(currency));
}

function readTrips(value: unknown): Trip[] {
  if (!Array.isArray(value)) throw new Error("Invalid trips");

  return value.map((trip) => {
    if (
      !isRecord(trip) ||
      typeof trip.id !== "string" ||
      typeof trip.name !== "string"
    ) {
      throw new Error("Invalid trip");
    }

    const currency = typeof trip.currency === "string" ? trip.currency : "GBP";
    currencyDigits(currency);

    return { id: trip.id, name: trip.name, currency };
  });
}

function readBudgets(value: unknown): Budgets {
  if (!isRecord(value)) throw new Error("Invalid budgets");

  const result: Budgets = {};

  for (const [id, budget] of Object.entries(value)) {
    if (
      !isRecord(budget) ||
      typeof budget.currency !== "string" ||
      !(
        budget.target === null ||
        (Number.isSafeInteger(budget.target) && Number(budget.target) >= 0)
      ) ||
      !Array.isArray(budget.expenses)
    ) {
      throw new Error("Invalid budget");
    }

    currencyDigits(budget.currency);

    const expenses = budget.expenses.map((expense) => {
      if (
        !isRecord(expense) ||
        typeof expense.id !== "string" ||
        typeof expense.title !== "string" ||
        typeof expense.category !== "string" ||
        !Number.isSafeInteger(expense.amount) ||
        Number(expense.amount) < 0
      ) {
        throw new Error("Invalid expense");
      }

      return {
        id: expense.id,
        title: expense.title,
        category: expense.category,
        amount: Number(expense.amount),
      };
    });

    result[id] = {
      currency: budget.currency,
      target: budget.target === null ? null : Number(budget.target),
      expenses,
    };
  }

  return result;
}

function readActivities(value: unknown): ActivityEstimates {
  if (!isRecord(value)) throw new Error("Invalid plans");

  const result: ActivityEstimates = {};

  for (const [id, plan] of Object.entries(value)) {
    if (!isRecord(plan) || !Array.isArray(plan.activities)) {
      throw new Error("Invalid plan");
    }

    result[id] = plan.activities.map((activity) => {
      if (
        !isRecord(activity) ||
        typeof activity.id !== "string" ||
        typeof activity.title !== "string" ||
        !Number.isInteger(activity.day) ||
        Number(activity.day) < 1 ||
        typeof activity.cost !== "number" ||
        !Number.isFinite(activity.cost) ||
        activity.cost < 0 ||
        activity.cost > 10_000_000_000
      ) {
        throw new Error("Invalid activity estimate");
      }

      return {
        id: activity.id,
        title: activity.title,
        day: Number(activity.day),
        cost: activity.cost,
      };
    });
  }

  return result;
}

export default function BudgetPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [budgets, setBudgets] = useState<Budgets>({});
  const [activityEstimates, setActivityEstimates] = useState<ActivityEstimates>({});
  const [tripId, setTripId] = useState("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [targetInput, setTargetInput] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Accommodation");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    try {
      const loadedTrips = readTrips(
        JSON.parse(localStorage.getItem(TRIPS_KEY) ?? "[]"),
      );
      const loadedBudgets = readBudgets(
        JSON.parse(localStorage.getItem(BUDGETS_KEY) ?? "{}"),
      );
      const loadedActivities = readActivities(
        JSON.parse(localStorage.getItem(PLANS_KEY) ?? "{}"),
      );

      setTrips(loadedTrips);
      setBudgets(loadedBudgets);
      setActivityEstimates(loadedActivities);

      const firstTrip = loadedTrips[0];
      setTripId(firstTrip?.id ?? "");

      const firstBudget = firstTrip ? loadedBudgets[firstTrip.id] : undefined;

      if (firstBudget?.target != null) {
        setTargetInput(amountInput(firstBudget.target, firstBudget.currency));
      }
    } catch {
      setLoadError(
        "Your saved trips, activities or budget couldn’t be loaded. Reload before making changes.",
      );
    } finally {
      setReady(true);
    }
  }, []);

  const trip = trips.find((item) => item.id === tripId);
  const budget: Budget = budgets[tripId] ?? {
    currency: trip?.currency ?? "GBP",
    target: null,
    expenses: [],
  };

  const currencyMismatch = Boolean(
    trip && budget.currency !== trip.currency,
  );

  const activities = activityEstimates[tripId] ?? [];
  const factor = currencyFactor(trip?.currency ?? "GBP");
  const activityTotal = activities.reduce(
    (total, activity) => total + Math.round(activity.cost * factor),
    0,
  );
  const extraTotal = budget.expenses.reduce(
    (total, expense) => total + expense.amount,
    0,
  );
  const total = activityTotal + extraTotal;
  const remaining = budget.target === null ? null : budget.target - total;

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setTitle("");
    setCategory("Accommodation");
    setAmount("");
    setError("");
  }

  function startExpense() {
    closeForm();
    setNotice("");
    setShowForm(true);
  }

  function persistBudget(updated: Budget) {
    const nextBudgets = { ...budgets, [tripId]: updated };

    try {
      localStorage.setItem(BUDGETS_KEY, JSON.stringify(nextBudgets));
      setBudgets(nextBudgets);
      setError("");
      return true;
    } catch {
      setError("Your budget couldn’t be saved. Check browser storage and try again.");
      return false;
    }
  }

  function saveTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip || currencyMismatch) return;

    const target = targetInput.trim()
      ? parseAmount(targetInput, trip.currency)
      : null;

    if (targetInput.trim() && target === null) {
      setError(`Enter a valid ${trip.currency} amount with the correct number of decimal places.`);
      return;
    }

    if (persistBudget({ ...budget, target })) {
      setNotice(target === null ? "Budget target cleared." : "Budget target saved.");
    }
  }

  function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip || currencyMismatch) return;

    const parsedAmount = parseAmount(amount, trip.currency);

    if (!title.trim() || parsedAmount === null) {
      setError("Add a cost name and a valid amount. Use a decimal point without commas.");
      return;
    }

    const expense: Expense = {
      id: editingId ?? crypto.randomUUID(),
      title: title.trim(),
      category,
      amount: parsedAmount,
    };

    const expenses = editingId
      ? budget.expenses.map((item) => item.id === editingId ? expense : item)
      : [...budget.expenses, expense];

    if (persistBudget({ ...budget, expenses })) {
      const wasEditing = Boolean(editingId);
      closeForm();
      setNotice(wasEditing ? "Cost updated." : "Cost added.");
    }
  }

  function editExpense(expense: Expense) {
    setEditingId(expense.id);
    setTitle(expense.title);
    setCategory(expense.category);
    setAmount(amountInput(expense.amount, budget.currency));
    setShowForm(true);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeExpense(expense: Expense) {
    if (
      persistBudget({
        ...budget,
        expenses: budget.expenses.filter((item) => item.id !== expense.id),
      })
    ) {
      if (editingId === expense.id) closeForm();
      setNotice(`${expense.title} removed.`);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          Make room for what matters
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Your trip budget
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-muted">
          A clear picture of your planned costs, with a little
          breathing room for the unexpected.
        </p>

        {!ready && <p role="status" className="mt-8">Loading your budget…</p>}
        {loadError && <p role="alert" className="mt-8 text-terracotta">{loadError}</p>}

        {ready && !loadError && !trip && (
          <Card className="mt-8">
            <CardContent>
              <h2 className="text-2xl font-semibold">First, give the journey a name.</h2>
              <p className="mt-3 mb-6 text-muted">
                Create a trip before planning its budget.
              </p>
              <ButtonLink href="/trips">Go to my trips</ButtonLink>
            </CardContent>
          </Card>
        )}

        {ready && !loadError && trip && (
          <>
            <div className="mt-8 max-w-md">
              <label htmlFor="budget-trip" className="text-sm font-semibold">
                Choose your trip
              </label>
              <select
                id="budget-trip"
                value={tripId}
                onChange={(event) => {
                  const id = event.target.value;
                  const selectedBudget = budgets[id];

                  setTripId(id);
                  closeForm();
                  setNotice("");
                  setTargetInput(
                    selectedBudget?.target != null
                      ? amountInput(selectedBudget.target, selectedBudget.currency)
                      : "",
                  );
                }}
                className={inputStyles}
              >
                {trips.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

            {currencyMismatch ? (
              <Card className="mt-8">
                <CardContent>
                  <h2 className="text-xl font-semibold">Your trip currency changed</h2>
                  <p className="mt-3 leading-relaxed text-muted">
                    This budget was saved in {budget.currency}, while your trip
                    now uses {trip.currency}. To keep amounts accurate, change
                    the trip currency back to {budget.currency} before editing
                    this budget. Currency conversion isn’t available yet.
                  </p>
                  <ButtonLink href="/trips" className="mt-5">
                    Edit trip currency
                  </ButtonLink>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  {[
                    {
                      label: "Activities",
                      value: formatMoney(activityTotal, trip.currency),
                      colour: "bg-sky",
                    },
                    {
                      label: "Extra trip costs",
                      value: formatMoney(extraTotal, trip.currency),
                      colour: "bg-[#f0dfce]",
                    },
                    {
                      label: "Total estimated",
                      value: formatMoney(total, trip.currency),
                      colour: "bg-[#e4e9d9]",
                    },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-3xl p-6 ${item.colour}`}>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-3 break-words text-3xl font-semibold">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <p role="status" className="mt-4 text-sm text-muted">{notice}</p>
                {error && <p role="alert" className="mt-4 text-terracotta">{error}</p>}

                <Card className="mt-6">
                  <CardContent>
                    <h2 className="text-xl font-semibold">Your budget target</h2>
                    <p className="mt-2 text-sm text-muted">
                      Set a total for the trip. Leave blank to clear it.
                    </p>

                    <form
                      onSubmit={saveTarget}
                      className="mt-5 flex max-w-lg flex-wrap items-end gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <label htmlFor="budget-target" className="text-sm font-semibold">
                          Target ({trip.currency})
                        </label>
                        <input
                          id="budget-target"
                          type="number"
                          min="0"
                          step={1 / factor}
                          value={targetInput}
                          onChange={(event) => setTargetInput(event.target.value)}
                          placeholder="Your comfortable limit"
                          className={inputStyles}
                        />
                      </div>
                      <Button type="submit">Save target</Button>
                    </form>

                    {remaining !== null && (
                      <p className={`mt-5 font-semibold ${remaining < 0 ? "text-terracotta" : "text-foreground"}`}>
                        {remaining < 0
                          ? `${formatMoney(-remaining, trip.currency)} over your target`
                          : `${formatMoney(remaining, trip.currency)} left in your plan`}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold">Extra trip costs</h2>
                    <p className="mt-2 text-sm text-muted">
                      Add costs you haven’t already included in activities.
                    </p>
                  </div>
                  <Button
                    onClick={startExpense}
                    aria-expanded={showForm}
                    aria-controls="expense-form"
                  >
                    ＋ Add a cost
                  </Button>
                </div>

                {showForm && (
                  <Card className="mt-5">
                    <CardContent>
                      <h3 className="text-xl font-semibold">
                        {editingId ? "Update this cost" : "Another piece of the plan"}
                      </h3>

                      <form
                        id="expense-form"
                        onSubmit={saveExpense}
                        className="mt-5 max-w-2xl space-y-5"
                      >
                        <div>
                          <label htmlFor="expense-title" className="text-sm font-semibold">
                            Cost name
                          </label>
                          <input
                            id="expense-title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Three nights in Lisbon"
                            maxLength={150}
                            required
                            className={inputStyles}
                          />
                        </div>

                        <div className="grid gap-5 sm:grid-cols-2">
                          <div>
                            <label htmlFor="expense-category" className="text-sm font-semibold">
                              Category
                            </label>
                            <select
                              id="expense-category"
                              value={category}
                              onChange={(event) => setCategory(event.target.value)}
                              className={inputStyles}
                            >
                              {categories.map((item) => (
                                <option key={item} value={item}>{item}</option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label htmlFor="expense-amount" className="text-sm font-semibold">
                              Estimated amount ({trip.currency})
                            </label>
                            <input
                              id="expense-amount"
                              type="number"
                              min="0"
                              step={1 / factor}
                              value={amount}
                              onChange={(event) => setAmount(event.target.value)}
                              required
                              className={inputStyles}
                            />
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <Button type="submit">
                            {editingId ? "Save changes" : "Save cost"}
                          </Button>
                          <Button variant="ghost" onClick={closeForm}>Cancel</Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                )}

                {budget.expenses.length === 0 ? (
                  <div className="mt-5 rounded-3xl border border-dashed border-foreground/20 p-8 text-center">
                    <p className="font-semibold">The bigger picture starts here.</p>
                    <p className="mt-2 text-sm text-muted">
                      Add accommodation, transport or a food allowance.
                    </p>
                  </div>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {budget.expenses.map((expense) => (
                      <li key={expense.id}>
                        <Card>
                          <CardContent className="flex flex-wrap items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-xs font-bold uppercase tracking-widest text-terracotta">
                                {expense.category}
                              </p>
                              <h3 className="mt-2 break-words font-semibold">
                                {expense.title}
                              </h3>
                              <p className="mt-1 text-sm text-muted">
                                {formatMoney(expense.amount, trip.currency)}
                              </p>
                            </div>

                            <div className="flex gap-2">
                              <Button variant="secondary" onClick={() => editExpense(expense)}>
                                Edit
                              </Button>
                              <Button variant="ghost" onClick={() => removeExpense(expense)}>
                                Remove
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}

                <Card className="mt-8">
                  <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <h2 className="text-xl font-semibold">From your itinerary</h2>
                      <ButtonLink href="/trips/itinerary" variant="secondary">
                        Edit activities ↗
                      </ButtonLink>
                    </div>

                    {activities.length === 0 ? (
                      <p className="mt-5 text-sm text-muted">
                        Activity estimates will appear here when you add them
                        to your itinerary.
                      </p>
                    ) : (
                      <ul className="mt-5 divide-y divide-foreground/10">
                        {[...activities]
                          .sort((a, b) => a.day - b.day)
                          .map((activity) => (
                            <li
                              key={activity.id}
                              className="flex justify-between gap-4 py-4"
                            >
                              <div className="min-w-0">
                                <p className="break-words text-sm font-semibold">
                                  {activity.title}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                  Day {activity.day}
                                </p>
                              </div>
                              <p className="shrink-0 text-sm font-medium">
                                {formatMoney(
                                  Math.round(activity.cost * factor),
                                  trip.currency,
                                )}
                              </p>
                            </li>
                          ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <p className="mt-6 text-sm leading-relaxed text-muted">
                  These are whole-trip estimates, not payments or per-person
                  shares. Booking records don’t add costs automatically.
                  Refresh this page after editing activity estimates in another tab.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
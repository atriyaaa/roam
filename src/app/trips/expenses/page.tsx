"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { accountStorage } from "@/lib/account-storage";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  EXPENSES_KEY, readLedger, readLedgers, parseMoney, formatMoney,
  currencyDigits, splitExpense, calculateBalances, suggestRepayments,
} from "@/lib/shared-expenses";
import type { Ledger, Ledgers, SharedExpense } from "@/lib/shared-expenses";

type Trip = { id: string; name: string; currency: string };
const inputStyles = "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

function readTrips(value: unknown): Trip[] {
  if (!Array.isArray(value)) throw new Error("Your trips couldn’t be read.");
  return value.map((trip) => {
    if (typeof trip !== "object" || trip === null ||
        typeof trip.id !== "string" || typeof trip.name !== "string") {
      throw new Error("A trip couldn’t be read.");
    }
    const currency = typeof trip.currency === "string" ? trip.currency : "GBP";
    currencyDigits(currency);
    return { id: trip.id, name: trip.name, currency };
  });
}

export default function ExpensesPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState("");
  const [ledgers, setLedgers] = useState<Ledgers>({});
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [travellerName, setTravellerName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState("");
  const [splitAmong, setSplitAmong] = useState<string[]>([]);

  useEffect(() => {
    try {
      const loadedTrips = readTrips(JSON.parse(accountStorage.getItem("roam.trips.v1") ?? "[]"));
      setTrips(loadedTrips);
      setLedgers(readLedgers(JSON.parse(accountStorage.getItem(EXPENSES_KEY) ?? "{}")));
      setTripId(loadedTrips[0]?.id ?? "");
      setReady(true);
    } catch {
      setLoadError("Your saved trips or expenses couldn’t be loaded. Reload before making changes.");
    }
  }, []);

  const trip = trips.find((item) => item.id === tripId);
  const ledger: Ledger = ledgers[tripId] ?? {
    currency: trip?.currency ?? "GBP", travellers: [], expenses: [],
  };
  const mismatch = Boolean(trip && trip.currency !== ledger.currency);
  const balances = calculateBalances(ledger);
  const repayments = suggestRepayments(balances);
  const total = ledger.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const personName = (id: string) => ledger.travellers.find((person) => person.id === id)?.name ?? "Traveller";

  function persist(next: Ledger) {
    try {
      const valid = readLedger(next);
      // Re-read other trip ledgers so saving this trip preserves their latest data.
      const latest = readLedgers(JSON.parse(accountStorage.getItem(EXPENSES_KEY) ?? "{}"));
      const updated = { ...latest, [tripId]: valid };
      accountStorage.setItem(EXPENSES_KEY, JSON.stringify(updated));
      setLedgers(updated);
      setError("");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your expenses couldn’t be saved.");
      return false;
    }
  }

  function addTraveller(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = travellerName.trim();
    if (!name) { setError("Add a traveller’s name."); return; }
    if (ledger.travellers.some((person) => person.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError("That name is already in the group. Use a distinct name for each person."); return;
    }
    if (persist({ ...ledger, travellers: [...ledger.travellers, { id: crypto.randomUUID(), name }] })) {
      setTravellerName("");
      setNotice(`${name} added to the group.`);
    }
  }

  function removeTraveller(id: string) {
    if (ledger.expenses.some((expense) => expense.payerId === id || expense.splitAmong.includes(id))) {
      setError("This traveller is part of an expense. Edit or remove those expenses first."); return;
    }
    if (persist({ ...ledger, travellers: ledger.travellers.filter((person) => person.id !== id) })) {
      setNotice("Traveller removed.");
    }
  }

  function closeForm() {
    setShowForm(false); setEditingId(null); setTitle(""); setAmount("");
    setPayerId(""); setSplitAmong([]); setError("");
  }

  function startExpense(expense?: SharedExpense) {
    setEditingId(expense?.id ?? null);
    setTitle(expense?.title ?? "");
    setAmount(expense ? (expense.amount / 10 ** currencyDigits(ledger.currency)).toFixed(currencyDigits(ledger.currency)) : "");
    setPayerId(expense?.payerId ?? ledger.travellers[0]?.id ?? "");
    setSplitAmong(expense?.splitAmong ?? ledger.travellers.map((person) => person.id));
    setError(""); setNotice(""); setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseMoney(amount, ledger.currency);
    if (!title.trim() || parsed === null || !payerId || splitAmong.length === 0) {
      setError("Add a name, a positive amount, who paid, and at least one person to split with."); return;
    }
    const expense: SharedExpense = {
      id: editingId ?? crypto.randomUUID(), title: title.trim(),
      amount: parsed, payerId, splitAmong,
    };
    const expenses = editingId
      ? ledger.expenses.map((item) => item.id === editingId ? expense : item)
      : [...ledger.expenses, expense];
    if (persist({ ...ledger, expenses })) {
      closeForm(); setNotice("Expense saved. Save to cloud when you’re ready to sync.");
    }
  }

  function removeExpense(id: string) {
    if (persist({ ...ledger, expenses: ledger.expenses.filter((expense) => expense.id !== id) })) {
      if (editingId === id) closeForm();
      setNotice("Expense removed and balances updated.");
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">Good company. Clear costs.</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Share the adventure.<br />Split the expenses.</h1>
        <p className="mt-4 max-w-xl leading-relaxed text-muted">Record what people paid, choose who shares each cost and see a simple way to square up.</p>

        {!ready && !loadError && <p role="status" className="mt-8">Loading expenses…</p>}
        {loadError && <p role="alert" className="mt-8 text-terracotta">{loadError}</p>}
        {ready && !trip && <div className="mt-8"><ButtonLink href="/trips">Create a trip first</ButtonLink></div>}

        {ready && trip && <>
          <div className="mt-8 max-w-md">
            <label htmlFor="expense-trip" className="text-sm font-semibold">Choose your trip</label>
            <select id="expense-trip" value={tripId} className={inputStyles} onChange={(event) => {
              setTripId(event.target.value); closeForm(); setNotice(""); setTravellerName("");
            }}>
              {trips.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          {mismatch ? <Card className="mt-8"><CardContent>
            <h2 className="text-xl font-semibold">This ledger uses {ledger.currency}</h2>
            <p className="mt-3 text-muted">Your trip now uses {trip.currency}. Change it back to {ledger.currency} in My trips to continue. Amounts aren’t converted automatically.</p>
            <ButtonLink href="/trips" className="mt-5">Edit trip</ButtonLink>
          </CardContent></Card> : <>
            <div className="mt-7 rounded-3xl bg-sky p-6">
              <p className="font-semibold">A payment ledger, separate from your budget.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">Record money already paid here. These entries don’t add to your estimated budget, and repayments below are suggestions, not money transfers. Adding a traveller doesn’t invite them to an account.</p>
            </div>

            <p role="status" className="mt-4 text-sm text-muted">{notice}</p>
            {error && <p role="alert" className="mt-4 rounded-2xl border border-terracotta/30 bg-white p-4 text-sm text-terracotta">{error}</p>}

            <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-6">
                <Card><CardContent>
                  <h2 className="text-2xl font-semibold">Who’s coming?</h2>
                  <form onSubmit={addTraveller} className="mt-5 flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <label htmlFor="traveller-name" className="text-sm font-semibold">Traveller name</label>
                      <input id="traveller-name" value={travellerName} maxLength={60} required placeholder="Add a friend" className={inputStyles} onChange={(event) => setTravellerName(event.target.value)} />
                    </div>
                    <Button type="submit" disabled={ledger.travellers.length >= 30}>Add traveller</Button>
                  </form>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {ledger.travellers.map((person) => <li key={person.id} className="inline-flex items-center gap-2 rounded-full bg-background py-2 pr-2 pl-4 text-sm">
                      {person.name}<button type="button" aria-label={`Remove ${person.name}`} className="rounded-full px-2 py-1 hover:bg-white" onClick={() => removeTraveller(person.id)}>×</button>
                    </li>)}
                  </ul>
                </CardContent></Card>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-2xl font-semibold">What’s been paid</h2>
                  <Button onClick={() => startExpense()} disabled={ledger.travellers.length === 0 || ledger.expenses.length >= 1000} aria-expanded={showForm} aria-controls="shared-expense-form">＋ Add expense</Button>
                </div>

                {showForm && <Card><CardContent>
                  <h3 className="text-xl font-semibold">{editingId ? "Edit expense" : "Keep the details clear"}</h3>
                  <form id="shared-expense-form" onSubmit={saveExpense} className="mt-5 space-y-5">
                    <div><label htmlFor="shared-title" className="text-sm font-semibold">Expense name</label>
                      <input id="shared-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={150} placeholder="Dinner in Lisbon" className={inputStyles} /></div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div><label htmlFor="shared-amount" className="text-sm font-semibold">Amount ({ledger.currency})</label>
                        <input id="shared-amount" type="number" min={1 / 10 ** currencyDigits(ledger.currency)} step={1 / 10 ** currencyDigits(ledger.currency)} value={amount} onChange={(event) => setAmount(event.target.value)} required className={inputStyles} /></div>
                      <div><label htmlFor="shared-payer" className="text-sm font-semibold">Who paid?</label>
                        <select id="shared-payer" value={payerId} required className={inputStyles} onChange={(event) => setPayerId(event.target.value)}>
                          <option value="">Choose a traveller</option>
                          {ledger.travellers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                        </select></div>
                    </div>
                    <fieldset><legend className="text-sm font-semibold">Split equally between</legend>
                      <div className="mt-3 flex flex-wrap gap-3">
                        {ledger.travellers.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-2 rounded-2xl border border-foreground/15 p-3 text-sm">
                          <input type="checkbox" className="accent-terracotta" checked={splitAmong.includes(person.id)} onChange={(event) => setSplitAmong((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))} />{person.name}
                        </label>)}
                      </div><p className="mt-3 text-xs leading-relaxed text-muted">Include the payer if they share this cost too. Any rounding remainder is assigned in selection order, keeping the total exact.</p>
                    </fieldset>
                    <div className="flex gap-3"><Button type="submit">Save expense</Button><Button variant="ghost" onClick={closeForm}>Cancel</Button></div>
                  </form>
                </CardContent></Card>}

                {ledger.expenses.length === 0 ? <div className="rounded-3xl border border-dashed border-foreground/20 p-8 text-center">
                  <h3 className="text-xl font-semibold">Keep the memories. Skip the maths.</h3>
                  <p className="mt-3 text-sm text-muted">Add travellers, then record your first shared cost.</p>
                </div> : <ul className="space-y-4">{ledger.expenses.map((expense) => <li key={expense.id}><Card><CardContent>
                  <div className="flex flex-wrap justify-between gap-3"><h3 className="break-words text-xl font-semibold">{expense.title}</h3><p className="text-lg font-semibold">{formatMoney(expense.amount, ledger.currency)}</p></div>
                  <p className="mt-2 text-sm text-muted">Paid by {personName(expense.payerId)}</p>
                  <ul className="mt-4 space-y-1 text-sm text-muted">{splitExpense(expense).map((share) => <li key={share.id} className="flex justify-between gap-4"><span>{personName(share.id)}</span><span>{formatMoney(share.amount, ledger.currency)}</span></li>)}</ul>
                  <div className="mt-5 flex gap-2"><Button variant="secondary" onClick={() => startExpense(expense)}>Edit</Button><Button variant="ghost" onClick={() => removeExpense(expense.id)}>Remove</Button></div>
                </CardContent></Card></li>)}</ul>}
              </div>

              <aside aria-label="Group balances" className="space-y-5">
                <div className="rounded-3xl bg-[#e4e9d9] p-6"><p className="text-xs font-bold uppercase tracking-widest">Total recorded</p><p className="mt-3 text-3xl font-semibold">{formatMoney(total, ledger.currency)}</p><p className="mt-2 text-sm text-muted">{ledger.expenses.length} expenses · {ledger.travellers.length} travellers</p></div>
                <Card><CardContent><h2 className="text-xl font-semibold">Everyone’s balance</h2>
                  <ul className="mt-5 space-y-4">{ledger.travellers.map((person) => <li key={person.id} className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-semibold">{person.name}</span><span className="text-muted">{balances[person.id] > 0 ? `Gets back ${formatMoney(balances[person.id], ledger.currency)}` : balances[person.id] < 0 ? `Owes ${formatMoney(-balances[person.id], ledger.currency)}` : "Even"}</span></li>)}</ul>
                </CardContent></Card>
                <Card><CardContent><h2 className="text-xl font-semibold">A way to square up</h2>
                  {repayments.length === 0 ? <p className="mt-4 text-sm text-muted">{ledger.expenses.length ? "Everyone is even based on the recorded expenses." : "Repayment suggestions will appear after you add expenses."}</p> : <ul className="mt-4 space-y-4">{repayments.map((payment, index) => <li key={index} className="rounded-2xl bg-background p-4 text-sm"><p className="leading-relaxed">{personName(payment.from)} → {personName(payment.to)}</p><p className="mt-2 font-semibold text-terracotta">{formatMoney(payment.amount, ledger.currency)}</p></li>)}</ul>}
                  <p className="mt-4 text-xs leading-relaxed text-muted">Suggested repayments only. Transfers made outside Roam aren’t tracked in this version.</p>
                </CardContent></Card>
                <ButtonLink href="/trips/cloud" variant="secondary" className="w-full">Save trip to cloud ↗</ButtonLink>
              </aside>
            </div>
          </>}
        </>}
      </main>
    </div>
  );
}

"use client";

import { accountStorage as localStorage } from "@/lib/account-storage";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Trip = {
  id: string;
  name: string;
  cities: string[];
  createdAt: string;
  startDate: string;
  endDate: string;
  currency: string;
};

type TripForm = {
  name: string;
  cities: string;
  startDate: string;
  endDate: string;
  currency: string;
  flexible: boolean;
};

const STORAGE_KEY = "roam.trips.v1";

const currencies = [
  { code: "GBP", label: "GBP — British pound" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "USD", label: "USD — US dollar" },
  { code: "CAD", label: "CAD — Canadian dollar" },
  { code: "AUD", label: "AUD — Australian dollar" },
  { code: "INR", label: "INR — Indian rupee" },
  { code: "JPY", label: "JPY — Japanese yen" },
];

const emptyForm: TripForm = {
  name: "",
  cities: "",
  startDate: "",
  endDate: "",
  currency: "GBP",
  flexible: true,
};

const inputStyles =
  "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 text-foreground outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

function readTrip(value: unknown): Trip {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid saved trip");
  }

  const trip = value as Record<string, unknown>;

  if (
    typeof trip.id !== "string" ||
    typeof trip.name !== "string" ||
    typeof trip.createdAt !== "string" ||
    !Array.isArray(trip.cities) ||
    !trip.cities.every((city) => typeof city === "string")
  ) {
    throw new Error("Invalid saved trip");
  }

  return {
    ...trip,
    id: trip.id,
    name: trip.name,
    cities: trip.cities,
    createdAt: trip.createdAt,
    startDate:
      typeof trip.startDate === "string" ? trip.startDate : "",
    endDate: typeof trip.endDate === "string" ? trip.endDate : "",
    currency: typeof trip.currency === "string" ? trip.currency : "GBP",
  };
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function tripDates(trip: Trip) {
  if (!trip.startDate || !trip.endDate) {
    return "Dates flexible";
  }

  return `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`;
}

function tripDuration(trip: Trip) {
  if (!trip.startDate || !trip.endDate) {
    return null;
  }

  const days =
    Math.round(
      (Date.parse(trip.endDate) - Date.parse(trip.startDate)) /
        86_400_000,
    ) + 1;

  return `${days} ${days === 1 ? "day" : "days"}`;
}

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<TripForm>(emptyForm);

  const selectedTrip = trips.find((trip) => trip.id === selectedId);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed: unknown = JSON.parse(saved);

        if (!Array.isArray(parsed)) {
          throw new Error("Invalid saved trips");
        }

        setTrips(parsed.map(readTrip));
      }
    } catch {
      setStorageError(
        "Your saved trips couldn’t be loaded. Reload the page before making changes.",
      );
    } finally {
      setReady(true);
    }
  }, []);

  function updateForm<K extends keyof TripForm>(
    field: K,
    value: TripForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function persistTrips(updatedTrips: Trip[]) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(updatedTrips),
      );

      setTrips(updatedTrips);
      return true;
    } catch {
      setError(
        "Your changes couldn’t be saved. Check that browser storage is available, then try again.",
      );
      return false;
    }
  }

  function startNewTrip() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setSelectedId(null);
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function editTrip(trip: Trip) {
    setForm({
      name: trip.name,
      cities: trip.cities.join(", "),
      startDate: trip.startDate,
      endDate: trip.endDate,
      currency: trip.currency,
      flexible: !trip.startDate || !trip.endDate,
    });

    setEditingId(trip.id);
    setSelectedId(null);
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function saveTrip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = form.name.trim();
    const cities = form.cities
      .split(",")
      .map((city) => city.trim())
      .filter(Boolean);

    if (!name || cities.length === 0) {
      setError("Add a trip name and at least one destination.");
      return;
    }

    if (!form.flexible) {
      if (!form.startDate || !form.endDate) {
        setError("Choose both dates or select flexible dates.");
        return;
      }

      if (form.endDate < form.startDate) {
        setError("Your end date must be on or after your start date.");
        return;
      }
    }

    const existingTrip = trips.find((trip) => trip.id === editingId);

    const trip: Trip = {
      ...existingTrip,
      id: existingTrip?.id ?? crypto.randomUUID(),
      name,
      cities,
      createdAt: existingTrip?.createdAt ?? new Date().toISOString(),
      startDate: form.flexible ? "" : form.startDate,
      endDate: form.flexible ? "" : form.endDate,
      currency: form.currency,
    };

    const updatedTrips = existingTrip
      ? trips.map((current) => (current.id === trip.id ? trip : current))
      : [trip, ...trips];

    if (persistTrips(updatedTrips)) {
      setSelectedId(trip.id);
      setShowForm(false);
      setEditingId(null);
      setError("");
      setNotice(existingTrip ? "Trip updated." : "Trip created.");
    }
  }

  function moveCity(trip: Trip, index: number, direction: -1 | 1) {
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= trip.cities.length) {
      return;
    }

    const reorderedCities = [...trip.cities];

    [reorderedCities[index], reorderedCities[nextIndex]] = [
      reorderedCities[nextIndex],
      reorderedCities[index],
    ];

    const updatedTrips = trips.map((current) =>
      current.id === trip.id
        ? { ...current, cities: reorderedCities }
        : current,
    );

    setError("");

    if (persistTrips(updatedTrips)) {
      setNotice(
        `${trip.cities[index]} moved to position ${nextIndex + 1}.`,
      );
    }
  }

  function openTrip(trip: Trip) {
    setSelectedId(trip.id);
    setShowForm(false);
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
              Your journeys, all together
            </p>

            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              My trips
            </h1>

            <p className="mt-4 max-w-lg leading-relaxed text-muted">
              Big adventures and little escapes. Give your next
              journey a place to begin.
            </p>
          </div>

          <Button
            disabled={!ready || Boolean(storageError)}
            onClick={startNewTrip}
            aria-expanded={showForm}
            aria-controls="trip-form"
          >
            <span aria-hidden="true">＋</span>
            Create a trip
          </Button>
        </div>

        <p className="mt-6 text-sm text-muted">
          Saved on this browser. Account sync is coming later.
        </p>

        <div role="status" className="mt-4 text-sm text-muted">
          {notice}
        </div>

        {(storageError || error) && (
          <p
            role="alert"
            className="mt-6 rounded-2xl border border-terracotta/30 bg-white p-4 text-terracotta"
          >
            {storageError || error}
          </p>
        )}

        {showForm && (
          <section
            id="trip-form"
            aria-labelledby="trip-form-heading"
            className="mt-8"
          >
            <Card>
              <CardContent className="sm:p-8">
                <h2
                  id="trip-form-heading"
                  className="text-2xl font-semibold tracking-tight"
                >
                  {editingId ? "Make it your kind of trip." : "Where are we heading?"}
                </h2>

                <form
                  onSubmit={saveTrip}
                  className="mt-6 max-w-2xl space-y-6"
                >
                  <div>
                    <label
                      htmlFor="trip-name"
                      className="text-sm font-semibold"
                    >
                      Trip name
                    </label>

                    <input
                      id="trip-name"
                      value={form.name}
                      onChange={(event) =>
                        updateForm("name", event.target.value)
                      }
                      placeholder="A little Iberian adventure"
                      maxLength={100}
                      required
                      className={inputStyles}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="trip-cities"
                      className="text-sm font-semibold"
                    >
                      Destinations
                    </label>

                    <input
                      id="trip-cities"
                      value={form.cities}
                      onChange={(event) =>
                        updateForm("cities", event.target.value)
                      }
                      placeholder="Lisbon, Seville, Barcelona"
                      maxLength={500}
                      aria-describedby="cities-help"
                      required
                      className={inputStyles}
                    />

                    <p id="cities-help" className="mt-2 text-sm text-muted">
                      Separate destinations with commas, in travel order.
                    </p>
                  </div>

                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.flexible}
                      onChange={(event) =>
                        updateForm("flexible", event.target.checked)
                      }
                      className="h-4 w-4 accent-terracotta"
                    />
                    My dates are flexible
                  </label>

                  {!form.flexible && (
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="start-date"
                          className="text-sm font-semibold"
                        >
                          Start date
                        </label>

                        <input
                          id="start-date"
                          type="date"
                          value={form.startDate}
                          onChange={(event) =>
                            updateForm("startDate", event.target.value)
                          }
                          required
                          className={inputStyles}
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="end-date"
                          className="text-sm font-semibold"
                        >
                          End date
                        </label>

                        <input
                          id="end-date"
                          type="date"
                          value={form.endDate}
                          min={form.startDate || undefined}
                          onChange={(event) =>
                            updateForm("endDate", event.target.value)
                          }
                          required
                          className={inputStyles}
                        />
                      </div>
                    </div>
                  )}

                  <div className="max-w-sm">
                    <label
                      htmlFor="currency"
                      className="text-sm font-semibold"
                    >
                      Trip currency
                    </label>

                    <select
                      id="currency"
                      value={form.currency}
                      onChange={(event) =>
                        updateForm("currency", event.target.value)
                      }
                      className={inputStyles}
                    >
                      {currencies.map((currency) => (
                        <option key={currency.code} value={currency.code}>
                          {currency.label}
                        </option>
                      ))}
                    </select>

                    <p className="mt-2 text-sm text-muted">
                      We’ll use this for your budget. Changing it won’t
                      convert amounts automatically.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit">
                      {editingId ? "Save changes" : "Save trip"}
                    </Button>

                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowForm(false);
                        setSelectedId(editingId);
                        setEditingId(null);
                        setError("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </section>
        )}

        {selectedTrip && (
          <section
            aria-labelledby="selected-trip-heading"
            className="mt-8 rounded-3xl bg-sky p-6 sm:p-8"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted">
                  Trip overview
                </p>

                <h2
                  id="selected-trip-heading"
                  className="mt-2 text-3xl font-semibold tracking-tight"
                >
                  {selectedTrip.name}
                </h2>

                <p className="mt-3 text-sm text-muted">
                  {tripDates(selectedTrip)}
                  {tripDuration(selectedTrip)
                    ? ` · ${tripDuration(selectedTrip)}`
                    : ""}
                  {" · "}
                  {selectedTrip.currency}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => editTrip(selectedTrip)}
                >
                  Edit trip
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close trip overview"
                >
                  ✕
                </Button>
              </div>
            </div>

            <h3 className="mt-8 font-semibold">Your route</h3>

            <p className="mt-1 text-sm text-muted">
              Move destinations up or down to change your travel order.
            </p>

            <ol className="mt-4 space-y-3">
              {selectedTrip.cities.map((city, index) => (
                <li
                  key={`${selectedTrip.id}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-sm font-bold text-terracotta">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="break-words font-medium">{city}</span>
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      className="px-3"
                      disabled={index === 0}
                      aria-label={`Move ${city} up`}
                      onClick={() => moveCity(selectedTrip, index, -1)}
                    >
                      ↑
                    </Button>

                    <Button
                      variant="ghost"
                      className="px-3"
                      disabled={index === selectedTrip.cities.length - 1}
                      aria-label={`Move ${city} down`}
                      onClick={() => moveCity(selectedTrip, index, 1)}
                    >
                      ↓
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {!ready ? (
          <p role="status" className="mt-12 text-muted">
            Loading your journeys…
          </p>
        ) : storageError ? null : trips.length === 0 ? (
          <section className="mt-10 rounded-[2rem] border border-dashed border-foreground/20 px-6 py-16 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              A blank page. A world of possibilities.
            </h2>

            <p className="mx-auto mt-3 max-w-md leading-relaxed text-muted">
              That weekend away or the journey you keep talking
              about — start by adding your first trip.
            </p>

            <Button className="mt-7" onClick={startNewTrip}>
              Plan my first trip
            </Button>
          </section>
        ) : (
          <section aria-label="Saved trips" className="mt-10">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {trips.map((trip, index) => (
                <Card key={trip.id} className="flex flex-col">
                  <div
                    className={`flex h-36 items-end justify-between p-6 ${
                      index % 3 === 0
                        ? "bg-sky"
                        : index % 3 === 1
                          ? "bg-[#f0dfce]"
                          : "bg-[#e4e9d9]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="text-5xl text-foreground/25"
                    >
                      ↗
                    </span>

                    <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium">
                      Draft
                    </span>
                  </div>

                  <CardContent className="flex flex-1 flex-col items-start">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted">
                      {trip.cities.length}{" "}
                      {trip.cities.length === 1
                        ? "destination"
                        : "destinations"}
                      {" · "}
                      {trip.currency}
                    </p>

                    <h2 className="mt-3 break-words text-2xl font-semibold tracking-tight">
                      {trip.name}
                    </h2>

                    <p className="mt-2 text-sm text-muted">
                      {tripDates(trip)}
                    </p>

                    <p className="mt-3 mb-6 text-sm leading-relaxed text-muted">
                      {trip.cities.join(" → ")}
                    </p>

                    <Button
                      variant="secondary"
                      className="mt-auto"
                      onClick={() => openTrip(trip)}
                    >
                      Open trip
                      <span aria-hidden="true">↗</span>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
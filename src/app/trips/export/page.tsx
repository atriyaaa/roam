"use client";

import { useEffect, useState } from "react";
import { accountStorage } from "@/lib/account-storage";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";

type Trip = {
  id: string;
  name: string;
  cities: string[];
  startDate: string;
  endDate: string;
};

type Activity = {
  id: string;
  day: number;
  title: string;
  city: string;
  time: string;
  duration: number;
  notes: string;
  travelMinutes: number;
};

type Plans = Record<string, Activity[]>;

const inputStyles =
  "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrips(value: unknown): Trip[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid trips");
  }

  return value.map((trip) => {
    if (
      !isObject(trip) ||
      typeof trip.id !== "string" ||
      typeof trip.name !== "string" ||
      !Array.isArray(trip.cities) ||
      !trip.cities.every((city) => typeof city === "string")
    ) {
      throw new Error("Invalid trip");
    }

    return {
      id: trip.id,
      name: trip.name,
      cities: trip.cities,
      startDate:
        typeof trip.startDate === "string" ? trip.startDate : "",
      endDate:
        typeof trip.endDate === "string" ? trip.endDate : "",
    };
  });
}

function readPlans(value: unknown): Plans {
  if (!isObject(value)) {
    throw new Error("Invalid plans");
  }

  const plans: Plans = {};

  for (const [tripId, plan] of Object.entries(value)) {
    if (!isObject(plan) || !Array.isArray(plan.activities)) {
      throw new Error("Invalid plan");
    }

    plans[tripId] = plan.activities.map((activity): Activity => {
      if (
        !isObject(activity) ||
        typeof activity.id !== "string" ||
        !Number.isInteger(activity.day) ||
        Number(activity.day) < 1 ||
        typeof activity.title !== "string" ||
        typeof activity.city !== "string" ||
        typeof activity.time !== "string" ||
        typeof activity.duration !== "number" ||
        !Number.isFinite(activity.duration) ||
        activity.duration <= 0
      ) {
        throw new Error("Invalid activity");
      }

      const travelMinutes =
        typeof activity.travelMinutes === "number" &&
        Number.isFinite(activity.travelMinutes) &&
        activity.travelMinutes >= 0
          ? activity.travelMinutes
          : 0;

      return {
        id: activity.id,
        day: Number(activity.day),
        title: activity.title,
        city: activity.city,
        time: activity.time,
        duration: activity.duration,
        notes: typeof activity.notes === "string" ? activity.notes : "",
        travelMinutes,
      };
    });
  }

  return plans;
}

function dateLabel(value: string) {
  if (!value) return "";

  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function dayDate(startDate: string, day: number) {
  if (!startDate) return "";

  const date = new Date(`${startDate}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return "";

  date.setUTCDate(date.getUTCDate() + day - 1);

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  return [
    hours ? `${hours}h` : "",
    remaining ? `${remaining}m` : "",
  ].filter(Boolean).join(" ") || "0m";
}

export default function ExportPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [plans, setPlans] = useState<Plans>({});
  const [tripId, setTripId] = useState("");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const loadedTrips = readTrips(
        JSON.parse(accountStorage.getItem("roam.trips.v1") ?? "[]"),
      );

      const loadedPlans = readPlans(
        JSON.parse(accountStorage.getItem("roam.plans.v1") ?? "{}"),
      );

      setTrips(loadedTrips);
      setPlans(loadedPlans);
      setTripId(loadedTrips[0]?.id ?? "");
      setReady(true);
    } catch {
      setError(
        "Your saved itinerary couldn’t be loaded. Reload before exporting.",
      );
    }
  }, []);

  const trip = trips.find((item) => item.id === tripId);
  const activities = plans[tripId] ?? [];

  const days = [...new Set(activities.map((activity) => activity.day))]
    .sort((a, b) => a - b);

  function printItinerary() {
    if (!trip) return;

    const previousTitle = document.title;
    document.title = `${trip.name} — Roam itinerary`;

    try {
      window.print();
    } finally {
      document.title = previousTitle;
    }
  }

  return (
    <div className="min-h-screen">
      <style>{`
        @page {
          margin: 16mm;
        }

        @media print {
          html, body {
            background: white !important;
            color: black !important;
          }
        }
      `}</style>

      <div className="print:hidden">
        <SiteHeader />
      </div>

      <main className="mx-auto max-w-5xl px-6 py-12 print:max-w-none print:p-0">
        <section className="print:hidden">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
            Take the plans with you
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            A little journey to keep.
          </h1>

          <p className="mt-4 max-w-xl leading-relaxed text-muted">
            Create a clean, printable itinerary to save as a PDF,
            share with friends or keep on your phone.
          </p>

          {!ready && !error && (
            <p role="status" className="mt-8">
              Preparing your itineraries…
            </p>
          )}

          {error && (
            <p role="alert" className="mt-8 text-terracotta">
              {error}
            </p>
          )}

          {ready && !trip && (
            <div className="mt-8">
              <p className="mb-5 text-muted">
                Create a trip or restore one from your cloud saves first.
              </p>

              <ButtonLink href="/trips">Open my trips</ButtonLink>
            </div>
          )}

          {ready && trip && (
            <div className="mt-8 rounded-3xl border border-foreground/10 bg-white p-6">
              <div className="max-w-md">
                <label
                  htmlFor="export-trip"
                  className="text-sm font-semibold"
                >
                  Choose your trip
                </label>

                <select
                  id="export-trip"
                  value={tripId}
                  onChange={(event) => {
                    setTripId(event.target.value);
                    setIncludeNotes(false);
                  }}
                  className={inputStyles}
                >
                  {trips.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(event) => setIncludeNotes(event.target.checked)}
                  className="h-4 w-4 accent-terracotta"
                />
                Include activity notes
              </label>

              <p className="mt-3 text-xs leading-relaxed text-muted">
                Booking references, budgets, expenses and map pins
                aren’t included in this export.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button onClick={printItinerary}>
                  Print / Save as PDF ↗
                </Button>

                <ButtonLink
                  href="/trips/itinerary"
                  variant="secondary"
                >
                  Edit itinerary
                </ButtonLink>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted">
                In the print window, choose “Save as PDF” as the
                destination. On Safari, use the PDF menu.
              </p>
            </div>
          )}
        </section>

        {ready && trip && (
          <article
            aria-label="Printable itinerary"
            className="mt-10 rounded-3xl border border-foreground/10 bg-white p-6 sm:p-10 print:m-0 print:rounded-none print:border-0 print:p-0"
          >
            <header className="break-inside-avoid border-b border-foreground/15 pb-7">
              <p className="text-2xl font-bold tracking-tight">
                roam<span className="text-terracotta">.</span>
              </p>

              <p className="mt-7 text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
                Your journey, beautifully planned
              </p>

              <h2 className="mt-3 break-words text-3xl font-semibold tracking-tight sm:text-4xl">
                {trip.name}
              </h2>

              <p className="mt-4 text-sm text-muted">
                {trip.startDate && trip.endDate
                  ? `${dateLabel(trip.startDate)} – ${dateLabel(trip.endDate)}`
                  : "Dates flexible"}
              </p>

              <p className="mt-3 break-words text-sm leading-relaxed">
                {trip.cities.join(" → ")}
              </p>

              <p className="mt-4 text-xs text-muted">
                {trip.cities.length} destinations · {activities.length} activities
              </p>
            </header>

            {days.length === 0 ? (
              <div className="py-10">
                <h3 className="text-xl font-semibold">
                  A little room for possibility.
                </h3>
                <p className="mt-3 text-sm text-muted">
                  Your destinations are ready. Day-by-day activities
                  haven’t been added yet.
                </p>
              </div>
            ) : (
              <div className="mt-8 space-y-9">
                {days.map((day) => {
                  const dayActivities = activities
                    .filter((activity) => activity.day === day)
                    .sort((a, b) => {
                      if (!a.time && !b.time) return 0;
                      if (!a.time) return 1;
                      if (!b.time) return -1;
                      return a.time.localeCompare(b.time);
                    });

                  return (
                    <section key={day} aria-labelledby={`export-day-${day}`}>
                      <div className="break-inside-avoid">
                        <h3
                          id={`export-day-${day}`}
                          className="text-xl font-semibold"
                        >
                          Day {day}
                        </h3>

                        {trip.startDate && (
                          <p className="mt-1 text-sm text-muted">
                            {dayDate(trip.startDate, day)}
                          </p>
                        )}
                      </div>

                      <ol className="mt-4 space-y-4">
                        {dayActivities.map((activity, index) => (
                          <li
                            key={activity.id}
                            className="break-inside-avoid"
                          >
                            {index > 0 && activity.travelMinutes > 0 && (
                              <p className="mb-3 border-l-2 border-dashed border-foreground/20 py-1 pl-4 text-xs text-muted">
                                {durationLabel(activity.travelMinutes)} travel
                                {" · "}Your estimate
                              </p>
                            )}

                            <div className="rounded-2xl border border-foreground/15 p-4 print:rounded-none">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <h4 className="break-words font-semibold">
                                  {activity.title}
                                </h4>

                                <p className="shrink-0 text-sm font-medium text-terracotta">
                                  {activity.time || "Any time"}
                                </p>
                              </div>

                              <p className="mt-2 text-sm text-muted">
                                {activity.city}
                                {" · "}
                                {durationLabel(activity.duration)}
                              </p>

                              {includeNotes && activity.notes && (
                                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                                  {activity.notes}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  );
                })}
              </div>
            )}

            <footer className="mt-10 break-inside-avoid border-t border-foreground/15 pt-5">
              <p className="text-xs text-muted">
                Roam — Plan the trip, keep the magic.
              </p>
              <p className="mt-2 text-xs text-muted">
                A snapshot of your itinerary. Plans may change after export.
              </p>
            </footer>
          </article>
        )}
      </main>
    </div>
  );
}
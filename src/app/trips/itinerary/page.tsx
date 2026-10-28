"use client";

import { accountStorage as localStorage } from "@/lib/account-storage";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Trip = {
  id: string;
  name: string;
  cities: string[];
  startDate: string;
  endDate: string;
  currency: string;
};

type Activity = {
  id: string;
  day: number;
  title: string;
  city: string;
  time: string;
  duration: number;
  cost: number;
  notes: string;
  travelMinutes: number;
};

type Plan = {
  dayCount: number;
  activities: Activity[];
};

type Plans = Record<string, Plan>;

type ActivityForm = {
  title: string;
  city: string;
  time: string;
  duration: string;
  cost: string;
  notes: string;
  travelMinutes: string;
};

const TRIPS_KEY = "roam.trips.v1";
const PLANS_KEY = "roam.plans.v1";

const emptyForm: ActivityForm = {
  title: "",
  city: "",
  time: "",
  duration: "60",
  cost: "",
  notes: "",
  travelMinutes: "0",
};

const inputStyles =
  "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrip(value: unknown): Trip {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !Array.isArray(value.cities) ||
    !value.cities.every((city) => typeof city === "string")
  ) {
    throw new Error("Invalid trip");
  }

  return {
    id: value.id,
    name: value.name,
    cities: value.cities,
    startDate: typeof value.startDate === "string" ? value.startDate : "",
    endDate: typeof value.endDate === "string" ? value.endDate : "",
    currency: typeof value.currency === "string" ? value.currency : "GBP",
  };
}

function readActivity(value: unknown): Activity {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !Number.isInteger(value.day) ||
    Number(value.day) < 1 ||
    typeof value.title !== "string" ||
    typeof value.city !== "string" ||
    typeof value.time !== "string" ||
    (value.time !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) ||
    typeof value.duration !== "number" ||
    !Number.isFinite(value.duration) ||
    value.duration <= 0 ||
    typeof value.cost !== "number" ||
    !Number.isFinite(value.cost) ||
    value.cost < 0 ||
    typeof value.notes !== "string"
  ) {
    throw new Error("Invalid activity");
  }

  const travelMinutes = value.travelMinutes ?? 0;

  if (
    typeof travelMinutes !== "number" ||
    !Number.isFinite(travelMinutes) ||
    travelMinutes < 0
  ) {
    throw new Error("Invalid travel time");
  }

  return {
    ...value,
    id: value.id,
    day: Number(value.day),
    title: value.title,
    city: value.city,
    time: value.time,
    duration: value.duration,
    cost: value.cost,
    notes: value.notes,
    travelMinutes,
  };
}

function readPlans(value: unknown): Plans {
  if (!isRecord(value)) throw new Error("Invalid plans");

  const result: Plans = {};

  for (const [id, plan] of Object.entries(value)) {
    if (
      !isRecord(plan) ||
      !Number.isInteger(plan.dayCount) ||
      Number(plan.dayCount) < 1 ||
      !Array.isArray(plan.activities)
    ) {
      throw new Error("Invalid plan");
    }

    result[id] = {
      dayCount: Number(plan.dayCount),
      activities: plan.activities.map(readActivity),
    };
  }

  return result;
}

function datedDayCount(trip: Trip) {
  if (!trip.startDate || !trip.endDate) return 0;

  const difference = Date.parse(trip.endDate) - Date.parse(trip.startDate);

  return Number.isFinite(difference) && difference >= 0
    ? Math.round(difference / 86_400_000) + 1
    : 0;
}

function dayDate(trip: Trip, day: number) {
  if (!trip.startDate) return "";

  const date = new Date(`${trip.startDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";

  date.setUTCDate(date.getUTCDate() + day - 1);

  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amount);
}

function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function durationLabel(value: number) {
  const hours = Math.floor(value / 60);
  const mins = value % 60;

  return [
    hours ? `${hours}h` : "",
    mins ? `${mins}m` : "",
  ].filter(Boolean).join(" ") || "0m";
}

function travelWarning(previous: Activity, current: Activity) {
  if (!previous.time || !current.time) return "";

  const previousEnd = minutes(previous.time) + previous.duration;
  const available = minutes(current.time) - previousEnd;

  if (available < 0) {
    return `These activities overlap by ${durationLabel(-available)}.`;
  }

  if (current.travelMinutes > available) {
    return `You need ${durationLabel(current.travelMinutes - available)} more travel time before this stop.`;
  }

  return "";
}

export default function ItineraryPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [plans, setPlans] = useState<Plans>({});
  const [tripId, setTripId] = useState("");
  const [activeDay, setActiveDay] = useState(1);
  const [form, setForm] = useState<ActivityForm>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const rawTrips: unknown = JSON.parse(
        localStorage.getItem(TRIPS_KEY) ?? "[]",
      );

      if (!Array.isArray(rawTrips)) throw new Error("Invalid trips");

      const loadedTrips = rawTrips.map(readTrip);
      const loadedPlans = readPlans(
        JSON.parse(localStorage.getItem(PLANS_KEY) ?? "{}"),
      );

      setTrips(loadedTrips);
      setPlans(loadedPlans);
      setTripId(loadedTrips[0]?.id ?? "");
    } catch {
      setLoadError(
        "Your saved trips or plans couldn’t be loaded. Reload before making changes.",
      );
    } finally {
      setReady(true);
    }
  }, []);

  const trip = trips.find((item) => item.id === tripId);
  const plan = plans[tripId] ?? { dayCount: 1, activities: [] };
  const dateDays = trip ? datedDayCount(trip) : 0;
  const lastActivityDay = plan.activities.reduce(
    (last, activity) => Math.max(last, activity.day),
    1,
  );
  const dayCount = Math.max(dateDays || plan.dayCount, lastActivityDay);

  const activities = plan.activities
    .filter((activity) => activity.day === activeDay)
    .sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });

  const activityMinutes = activities.reduce(
    (total, activity) => total + activity.duration,
    0,
  );

  // Travel is attached to the destination activity.
  // The first activity has no previous stop within this day.
  const travelMinutes = activities.reduce(
    (total, activity, index) =>
      total + (index > 0 ? activity.travelMinutes : 0),
    0,
  );

  const totalMinutes = activityMinutes + travelMinutes;
  const totalCost = activities.reduce((total, activity) => total + activity.cost, 0);
  const timedActivities = activities.filter((activity) => activity.time);

  // Compare all timed activities so long activities cannot hide overlaps.
  const overlapPairs = timedActivities.flatMap((current, index) =>
    timedActivities.slice(0, index).flatMap((previous) =>
      minutes(previous.time) + previous.duration > minutes(current.time)
        ? [`${previous.title} overlaps ${current.title}.`]
        : [],
    ),
  );

  const tightJourneys = activities.flatMap((activity, index) => {
    if (index === 0) return [];
    const previous = activities[index - 1];
    if (!previous.time || !activity.time) return [];

    const available =
      minutes(activity.time) - minutes(previous.time) - previous.duration;

    return available >= 0 && activity.travelMinutes > available
      ? [`Travel to ${activity.title} needs more time.`]
      : [];
  });

  const overnightActivities = timedActivities.filter(
    (activity) => minutes(activity.time) + activity.duration > 1440,
  );

  const pace =
    activities.length === 0
      ? {
          label: "A blank canvas",
          text: "Add a few plans and we’ll help you keep the day comfortable.",
          colour: "bg-sky",
        }
      : totalMinutes > 480
        ? {
            label: "Packed day",
            text: "More than eight hours are planned. Consider moving a stop to another day.",
            colour: "bg-[#f0dfce]",
          }
        : totalMinutes > 360
          ? {
              label: "Full day",
              text: "Six to eight hours are planned. Leave space for meals and a little rest.",
              colour: "bg-[#f0dfce]",
            }
          : {
              label: "Room to roam",
              text: "Up to six hours are planned. There’s room for breaks and discoveries.",
              colour: "bg-[#e4e9d9]",
            };

  function updateForm<K extends keyof ActivityForm>(
    field: K,
    value: ActivityForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function savePlan(nextPlan: Plan) {
    const nextPlans = { ...plans, [tripId]: nextPlan };

    try {
      localStorage.setItem(PLANS_KEY, JSON.stringify(nextPlans));
      setPlans(nextPlans);
      setError("");
      return true;
    } catch {
      setError("Your changes couldn’t be saved. Check browser storage and try again.");
      return false;
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
  }

  function changeDay(day: number) {
    setActiveDay(day);
    closeForm();
    setNotice("");
  }

  function startActivity() {
    setForm({ ...emptyForm, city: trip?.cities[0] ?? "" });
    setEditingId(null);
    setError("");
    setNotice("");
    setShowForm(true);
  }

  function editActivity(activity: Activity) {
    setForm({
      title: activity.title,
      city: activity.city,
      time: activity.time,
      duration: String(activity.duration),
      cost: String(activity.cost),
      notes: activity.notes,
      travelMinutes: String(activity.travelMinutes),
    });
    setEditingId(activity.id);
    setError("");
    setNotice("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submitActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const duration = Number(form.duration);
    const cost = form.cost.trim() ? Number(form.cost) : 0;
    const travel = form.travelMinutes.trim() ? Number(form.travelMinutes) : 0;

    if (
      !form.title.trim() ||
      !form.city ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      !Number.isFinite(cost) ||
      cost < 0 ||
      !Number.isInteger(travel) ||
      travel < 0
    ) {
      setError("Check the name, destination, duration, travel time and cost.");
      return;
    }

    const existing = plan.activities.find((item) => item.id === editingId);

    const activity: Activity = {
      ...existing,
      id: existing?.id ?? crypto.randomUUID(),
      day: activeDay,
      title: form.title.trim(),
      city: form.city,
      time: form.time,
      duration,
      cost,
      notes: form.notes.trim(),
      travelMinutes: travel,
    };

    const nextActivities = existing
      ? plan.activities.map((item) => item.id === activity.id ? activity : item)
      : [...plan.activities, activity];

    if (savePlan({ ...plan, activities: nextActivities })) {
      closeForm();
      setNotice(existing ? "Activity updated." : "Activity saved.");
    }
  }

  function removeActivity(activity: Activity) {
    if (
      savePlan({
        ...plan,
        activities: plan.activities.filter((item) => item.id !== activity.id),
      })
    ) {
      if (editingId === activity.id) closeForm();
      setNotice(`${activity.title} removed.`);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          A little plan. Plenty of possibility.
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Your itinerary
        </h1>
        <p className="mt-4 text-muted">
          Give each day a little shape. Leave room for a detour.
        </p>

        {!ready && <p role="status" className="mt-8">Loading your plans…</p>}
        {loadError && <p role="alert" className="mt-8 text-terracotta">{loadError}</p>}

        {ready && !loadError && !trip && (
          <Card className="mt-8">
            <CardContent>
              <h2 className="text-2xl font-semibold">Start with a trip.</h2>
              <p className="mt-3 mb-6 text-muted">
                Add your destinations before planning each day.
              </p>
              <ButtonLink href="/trips">Go to my trips</ButtonLink>
            </CardContent>
          </Card>
        )}

        {ready && !loadError && trip && (
          <>
            <div className="mt-8 max-w-md">
              <Field id="trip" label="Choose your trip">
                <select
                  id="trip"
                  value={tripId}
                  onChange={(event) => {
                    setTripId(event.target.value);
                    changeDay(1);
                  }}
                  className={inputStyles}
                >
                  {trips.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </Field>
            </div>

            <p className="mt-3 text-sm text-muted">
              {trip.cities.join(" → ")} · {trip.currency}
            </p>

            {dateDays > 0 && lastActivityDay > dateDays && (
              <p className="mt-4 text-sm text-terracotta">
                Some planned days fall after your trip’s end date.
                They remain visible so you can review them.
              </p>
            )}

            <div className="mt-8 flex gap-2 overflow-x-auto pb-3">
              {Array.from({ length: dayCount }, (_, index) => (
                <Button
                  key={index}
                  variant={activeDay === index + 1 ? "primary" : "secondary"}
                  className="shrink-0"
                  aria-pressed={activeDay === index + 1}
                  onClick={() => changeDay(index + 1)}
                >
                  Day {index + 1}
                </Button>
              ))}

              {!dateDays && (
                <Button
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => {
                    const nextDay = dayCount + 1;
                    if (savePlan({ ...plan, dayCount: nextDay })) changeDay(nextDay);
                  }}
                >
                  ＋ Add day
                </Button>
              )}
            </div>

            <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <section aria-labelledby="day-heading">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 id="day-heading" className="text-3xl font-semibold">
                      Day {activeDay}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {dayDate(trip, activeDay) || "Dates flexible"}
                    </p>
                  </div>
                  <Button
                    onClick={startActivity}
                    aria-expanded={showForm}
                    aria-controls="activity-form"
                  >
                    ＋ Add activity
                  </Button>
                </div>

                {error && <p role="alert" className="mt-4 text-terracotta">{error}</p>}
                <p role="status" className="mt-3 text-sm text-muted">{notice}</p>

                {showForm && (
                  <Card className="mt-5">
                    <CardContent>
                      <h3 className="text-xl font-semibold">
                        {editingId ? "Fine-tune your plans" : "A little something for your day"}
                      </h3>

                      <form
                        id="activity-form"
                        onSubmit={submitActivity}
                        className="mt-5 space-y-5"
                      >
                        <Field id="activity-title" label="Activity name">
                          <input
                            id="activity-title"
                            value={form.title}
                            onChange={(event) => updateForm("title", event.target.value)}
                            placeholder="Coffee and a wander in Alfama"
                            maxLength={150}
                            required
                            className={inputStyles}
                          />
                        </Field>

                        <Field id="activity-city" label="Destination">
                          <select
                            id="activity-city"
                            value={form.city}
                            onChange={(event) => updateForm("city", event.target.value)}
                            required
                            className={inputStyles}
                          >
                            <option value="">Choose a destination</option>
                            {[...new Set([
                              ...trip.cities,
                              ...(editingId && form.city ? [form.city] : []),
                            ])].map((city) => (
                              <option key={city} value={city}>{city}</option>
                            ))}
                          </select>
                        </Field>

                        <div className="grid gap-5 sm:grid-cols-2">
                          <Field id="activity-time" label="Start time — optional">
                            <input
                              id="activity-time"
                              type="time"
                              value={form.time}
                              onChange={(event) => updateForm("time", event.target.value)}
                              className={inputStyles}
                            />
                          </Field>
                          <Field id="activity-duration" label="Duration in minutes">
                            <input
                              id="activity-duration"
                              type="number"
                              min="1"
                              step="1"
                              value={form.duration}
                              onChange={(event) => updateForm("duration", event.target.value)}
                              required
                              className={inputStyles}
                            />
                          </Field>
                        </div>

                        <Field id="activity-travel" label="Travel from the previous stop — minutes">
                          <input
                            id="activity-travel"
                            type="number"
                            min="0"
                            step="1"
                            value={form.travelMinutes}
                            onChange={(event) => updateForm("travelMinutes", event.target.value)}
                            aria-describedby="travel-help"
                            className={inputStyles}
                          />
                          <p id="travel-help" className="mt-2 text-sm text-muted">
                            Enter your own estimate. Zero means no travel time
                            has been added. This is excluded for the first stop
                            of the day; review it if you change the stop order.
                          </p>
                        </Field>

                        <Field id="activity-cost" label={`Estimated cost (${trip.currency})`}>
                          <input
                            id="activity-cost"
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.cost}
                            onChange={(event) => updateForm("cost", event.target.value)}
                            placeholder="0.00"
                            className={inputStyles}
                          />
                        </Field>

                        <Field id="activity-notes" label="Notes — optional">
                          <textarea
                            id="activity-notes"
                            rows={3}
                            value={form.notes}
                            onChange={(event) => updateForm("notes", event.target.value)}
                            maxLength={2000}
                            placeholder="A recommendation, meeting point or reminder…"
                            className={inputStyles}
                          />
                        </Field>

                        <div className="flex gap-3">
                          <Button type="submit">
                            {editingId ? "Save changes" : "Save activity"}
                          </Button>
                          <Button variant="ghost" onClick={closeForm}>Cancel</Button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>
                )}

                {activities.length === 0 ? (
                  <div className="mt-5 rounded-3xl border border-dashed border-foreground/20 px-6 py-12 text-center">
                    <h3 className="text-xl font-semibold">
                      Leave room for something lovely.
                    </h3>
                    <p className="mt-3 text-sm text-muted">
                      Add your first activity when inspiration strikes.
                    </p>
                  </div>
                ) : (
                  <ol className="mt-5 space-y-4">
                    {activities.map((activity, index) => {
                      const previous = activities[index - 1];
                      const warning = previous
                        ? travelWarning(previous, activity)
                        : "";

                      return (
                        <li key={activity.id}>
                          {previous && (
                            <div className="mb-4 ml-5 border-l-2 border-dashed border-foreground/20 py-3 pl-5">
                              <p className="text-sm font-medium">
                                {activity.travelMinutes > 0
                                  ? `${durationLabel(activity.travelMinutes)} travel`
                                  : "Travel time not added"}
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                From {previous.title}
                              </p>
                              {warning && (
                                <p className="mt-2 text-sm text-terracotta">{warning}</p>
                              )}
                            </div>
                          )}

                          <Card>
                            <CardContent>
                              <p className="text-sm font-semibold text-terracotta">
                                {activity.time || "Any time"} · {durationLabel(activity.duration)}
                              </p>
                              <h3 className="mt-2 break-words text-xl font-semibold">
                                {activity.title}
                              </h3>
                              <p className="mt-2 text-sm text-muted">
                                {activity.city} · {money(activity.cost, trip.currency)}
                              </p>

                              {activity.notes && (
                                <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                                  {activity.notes}
                                </p>
                              )}

                              <div className="mt-5 flex gap-2">
                                <Button variant="secondary" onClick={() => editActivity(activity)}>
                                  Edit
                                </Button>
                                <Button variant="ghost" onClick={() => removeActivity(activity)}>
                                  Remove
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <aside aria-label="Daily overview" className="space-y-4">
                <div className={`rounded-3xl p-6 ${pace.colour}`}>
                  <p className="text-xs font-bold uppercase tracking-widest">
                    Daily pace
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold">{pace.label}</h2>
                  <p className="mt-3 text-sm leading-relaxed">{pace.text}</p>
                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    Based on activity durations and travel times you’ve entered.
                    Untimed activities count too.
                  </p>
                </div>

                <Card>
                  <CardContent>
                    <h2 className="text-xl font-semibold">Day at a glance</h2>

                    <dl className="mt-5 space-y-4 text-sm">
                      {[
                        ["Activities", String(activities.length)],
                        ["Activity time", durationLabel(activityMinutes)],
                        ["Travel time", durationLabel(travelMinutes)],
                        ["Total planned", durationLabel(totalMinutes)],
                        ["Estimated costs", money(totalCost, trip.currency)],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4">
                          <dt className="text-muted">{label}</dt>
                          <dd className="font-semibold">{value}</dd>
                        </div>
                      ))}
                    </dl>

                    <p className="mt-5 border-t border-foreground/10 pt-4 text-xs leading-relaxed text-muted">
                      These totals cover your activities and entered travel times.
                      Stays, unrecorded breaks and other expenses aren’t included.
                    </p>
                  </CardContent>
                </Card>

                {(overlapPairs.length > 0 || tightJourneys.length > 0) && (
                  <div className="rounded-3xl border border-terracotta/30 bg-white p-6">
                    <h2 className="font-semibold text-terracotta">
                      A little timing check
                    </h2>
                    <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-muted">
                      {[...overlapPairs, ...tightJourneys].map((message, index) => (
                        <li key={index}>{message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {overnightActivities.length > 0 && (
                  <p className="rounded-3xl bg-white p-6 text-sm text-muted">
                    Some activities run past midnight. They remain on their
                    starting day; check the following day separately.
                  </p>
                )}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
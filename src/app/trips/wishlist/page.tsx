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
  cities: string[];
  startDate: string;
  endDate: string;
};

type Idea = {
  id: string;
  tripId: string;
  title: string;
  city: string;
  category: string;
  notes: string;
};

type SavedActivity = {
  id: string;
  day: number;
  [key: string]: unknown;
};

type SavedPlan = {
  dayCount: number;
  activities: SavedActivity[];
  [key: string]: unknown;
};

type Plans = Record<string, SavedPlan>;

const TRIPS_KEY = "roam.trips.v1";
const PLANS_KEY = "roam.plans.v1";
const WISHLIST_KEY = "roam.wishlist.v1";

const categories = ["Café", "Food", "Sight", "Experience", "Shopping", "Other"];

const inputStyles =
  "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrips(value: unknown): Trip[] {
  if (!Array.isArray(value)) throw new Error("Invalid trips");

  return value.map((trip) => {
    if (
      !isRecord(trip) ||
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
      startDate: typeof trip.startDate === "string" ? trip.startDate : "",
      endDate: typeof trip.endDate === "string" ? trip.endDate : "",
    };
  });
}

function readIdeas(value: unknown): Idea[] {
  if (!Array.isArray(value)) throw new Error("Invalid wishlist");

  return value.map((idea) => {
    if (
      !isRecord(idea) ||
      typeof idea.id !== "string" ||
      typeof idea.tripId !== "string" ||
      typeof idea.title !== "string" ||
      typeof idea.city !== "string" ||
      typeof idea.category !== "string" ||
      typeof idea.notes !== "string"
    ) {
      throw new Error("Invalid idea");
    }

    return {
      id: idea.id,
      tripId: idea.tripId,
      title: idea.title,
      city: idea.city,
      category: idea.category,
      notes: idea.notes,
    };
  });
}

function readPlans(): Plans {
  const parsed: unknown = JSON.parse(
    localStorage.getItem(PLANS_KEY) ?? "{}",
  );

  if (!isRecord(parsed)) throw new Error("Invalid plans");

  const result: Plans = {};

  for (const [id, plan] of Object.entries(parsed)) {
    if (
      !isRecord(plan) ||
      !Number.isInteger(plan.dayCount) ||
      Number(plan.dayCount) < 1 ||
      !Array.isArray(plan.activities)
    ) {
      throw new Error("Invalid plan");
    }

    const activities = plan.activities.map((activity) => {
      if (
        !isRecord(activity) ||
        typeof activity.id !== "string" ||
        !Number.isInteger(activity.day) ||
        Number(activity.day) < 1
      ) {
        throw new Error("Invalid activity");
      }

      return {
        ...activity,
        id: activity.id,
        day: Number(activity.day),
      };
    });

    result[id] = {
      ...plan,
      dayCount: Number(plan.dayCount),
      activities,
    };
  }

  return result;
}

function dayCountFor(trip: Trip, plan?: SavedPlan) {
  let datedDays = 0;

  if (trip.startDate && trip.endDate) {
    const difference = Date.parse(trip.endDate) - Date.parse(trip.startDate);

    if (Number.isFinite(difference) && difference >= 0) {
      datedDays = Math.round(difference / 86_400_000) + 1;
    }
  }

  const lastActivityDay = (plan?.activities ?? []).reduce(
    (last, activity) => Math.max(last, activity.day),
    1,
  );

  return Math.max(datedDays || plan?.dayCount || 1, lastActivityDay);
}

export default function WishlistPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [plans, setPlans] = useState<Plans>({});
  const [tripId, setTripId] = useState("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("Café");
  const [notes, setNotes] = useState("");
  const [selectedDays, setSelectedDays] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const loadedTrips = readTrips(
        JSON.parse(localStorage.getItem(TRIPS_KEY) ?? "[]"),
      );

      setTrips(loadedTrips);
      setIdeas(
        readIdeas(JSON.parse(localStorage.getItem(WISHLIST_KEY) ?? "[]")),
      );
      setPlans(readPlans());
      setTripId(loadedTrips[0]?.id ?? "");
    } catch {
      setLoadError(
        "Your saved data couldn’t be loaded. Reload before making changes.",
      );
    } finally {
      setReady(true);
    }
  }, []);

  const trip = trips.find((item) => item.id === tripId);
  const tripIdeas = ideas.filter((idea) => idea.tripId === tripId);
  const dayCount = trip ? dayCountFor(trip, plans[tripId]) : 1;

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setTitle("");
    setCity("");
    setCategory("Café");
    setNotes("");
    setError("");
  }

  function startIdea() {
    closeForm();
    setCity(trip?.cities[0] ?? "");
    setNotice("");
    setShowForm(true);
  }

  function persistIdeas(updated: Idea[]) {
    try {
      localStorage.setItem(WISHLIST_KEY, JSON.stringify(updated));
      setIdeas(updated);
      setError("");
      return true;
    } catch {
      setError("Your wishlist couldn’t be saved. Check browser storage and try again.");
      return false;
    }
  }

  function saveIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || !city) {
      setError("Add a name and choose a destination.");
      return;
    }

    const idea: Idea = {
      id: editingId ?? crypto.randomUUID(),
      tripId,
      title: title.trim(),
      city,
      category,
      notes: notes.trim(),
    };

    const updated = editingId
      ? ideas.map((item) => item.id === editingId ? idea : item)
      : [idea, ...ideas];

    if (persistIdeas(updated)) {
      const wasEditing = Boolean(editingId);
      closeForm();
      setNotice(wasEditing ? "Idea updated." : "Saved for later.");
    }
  }

  function editIdea(idea: Idea) {
    setEditingId(idea.id);
    setTitle(idea.title);
    setCity(idea.city);
    setCategory(idea.category);
    setNotes(idea.notes);
    setError("");
    setNotice("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeIdea(idea: Idea) {
    if (persistIdeas(ideas.filter((item) => item.id !== idea.id))) {
      if (editingId === idea.id) closeForm();
      setNotice(`${idea.title} removed from your wishlist.`);
    }
  }

  function scheduleIdea(idea: Idea) {
    if (!trip) return;

    try {
      // Read the latest saved itinerary before adding an activity.
      const latestPlans = readPlans();
      const plan = latestPlans[tripId] ?? { dayCount: 1, activities: [] };
      const day = Number(selectedDays[idea.id] ?? "1");
      const activityId = `wishlist-${idea.id}`;

      if (
        !Number.isInteger(day) ||
        day < 1 ||
        day > dayCountFor(trip, plan)
      ) {
        setError("Choose an available day. Refresh if your trip dates changed.");
        return;
      }

      // A stable ID prevents duplicate activities if a previous
      // move saved the itinerary but could not update the wishlist.
      const existing = plan.activities.find(
        (activity) => activity.id === activityId,
      );

      const scheduledDay = existing?.day ?? day;

      if (!existing) {
        latestPlans[tripId] = {
          ...plan,
          activities: [
            ...plan.activities,
            {
              id: activityId,
              day,
              title: idea.title,
              city: idea.city,
              time: "",
              duration: 60,
              cost: 0,
              notes: idea.notes,
              travelMinutes: 0,
            },
          ],
        };

        localStorage.setItem(PLANS_KEY, JSON.stringify(latestPlans));
      }

      setPlans(latestPlans);

      const remaining = ideas.filter((item) => item.id !== idea.id);

      if (persistIdeas(remaining)) {
        if (editingId === idea.id) closeForm();
        setNotice(`${idea.title} is in Day ${scheduledDay}.`);
      } else {
        setError(
          `The activity is saved in Day ${scheduledDay}, but the wishlist couldn’t update. Try “Add to day” again to finish the move.`,
        );
      }
    } catch {
      setError(
        "The activity couldn’t be moved. Reload your saved plan and try again.",
      );
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
              For the places you don’t want to forget
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Your little wishlist
            </h1>
            <p className="mt-4 max-w-xl leading-relaxed text-muted">
              A café someone mentioned. A street worth wandering.
              Save the idea now, find its moment later.
            </p>
          </div>

          <Button
            onClick={startIdea}
            disabled={!ready || Boolean(loadError) || !trip}
            aria-expanded={showForm}
            aria-controls="idea-form"
          >
            ＋ Save an idea
          </Button>
        </div>

        {!ready && <p role="status" className="mt-8">Loading your ideas…</p>}

        {loadError && (
          <p role="alert" className="mt-8 text-terracotta">{loadError}</p>
        )}

        {ready && !loadError && !trip && (
          <Card className="mt-8">
            <CardContent>
              <h2 className="text-2xl font-semibold">First, pick your adventure.</h2>
              <p className="mt-3 mb-6 text-muted">
                Create a trip before collecting ideas for it.
              </p>
              <ButtonLink href="/trips">Go to my trips</ButtonLink>
            </CardContent>
          </Card>
        )}

        {ready && !loadError && trip && (
          <>
            <div className="mt-8 max-w-md">
              <label htmlFor="wishlist-trip" className="text-sm font-semibold">
                Choose your trip
              </label>
              <select
                id="wishlist-trip"
                value={tripId}
                onChange={(event) => {
                  setTripId(event.target.value);
                  closeForm();
                  setNotice("");
                }}
                className={inputStyles}
              >
                {trips.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

            <p role="status" className="mt-4 text-sm text-muted">{notice}</p>

            {error && (
              <p role="alert" className="mt-4 text-terracotta">{error}</p>
            )}

            {showForm && (
              <Card className="mt-6">
                <CardContent className="sm:p-8">
                  <h2 className="text-2xl font-semibold">
                    {editingId ? "Fine-tune your idea" : "Something worth saving"}
                  </h2>

                  <form
                    id="idea-form"
                    onSubmit={saveIdea}
                    className="mt-6 max-w-2xl space-y-5"
                  >
                    <div>
                      <label htmlFor="idea-title" className="text-sm font-semibold">
                        Name
                      </label>
                      <input
                        id="idea-title"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="That little café in Alfama"
                        maxLength={150}
                        required
                        className={inputStyles}
                      />
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <label htmlFor="idea-city" className="text-sm font-semibold">
                          Destination
                        </label>
                        <select
                          id="idea-city"
                          value={city}
                          onChange={(event) => setCity(event.target.value)}
                          required
                          className={inputStyles}
                        >
                          <option value="">Choose a destination</option>
                          {[...new Set([
                            ...trip.cities,
                            ...(editingId && city ? [city] : []),
                          ])].map((destination) => (
                            <option key={destination} value={destination}>
                              {destination}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="idea-category" className="text-sm font-semibold">
                          Category
                        </label>
                        <select
                          id="idea-category"
                          value={category}
                          onChange={(event) => setCategory(event.target.value)}
                          className={inputStyles}
                        >
                          {categories.map((item) => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="idea-notes" className="text-sm font-semibold">
                        Notes — optional
                      </label>
                      <textarea
                        id="idea-notes"
                        rows={3}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="Who recommended it? What makes it special?"
                        maxLength={2000}
                        className={inputStyles}
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button type="submit">
                        {editingId ? "Save changes" : "Save idea"}
                      </Button>
                      <Button variant="ghost" onClick={closeForm}>Cancel</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            <div className="mt-8 rounded-3xl bg-sky p-6">
              <p className="font-semibold">
                Collect first. Plan when you’re ready.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Adding an idea to a day moves it into your itinerary with
                no start time, a 60-minute duration and zero estimated cost.
                Edit those details in the itinerary afterwards.
              </p>
              <div className="mt-4">
                <ButtonLink href="/trips/itinerary" variant="secondary">
                  Open itinerary ↗
                </ButtonLink>
              </div>
            </div>

            <section aria-label="Saved ideas" className="mt-8">
              <p className="mb-5 text-sm text-muted">
                {tripIdeas.length} {tripIdeas.length === 1 ? "idea" : "ideas"} saved
              </p>

              {tripIdeas.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-foreground/20 px-6 py-14 text-center">
                  <h2 className="text-2xl font-semibold">
                    Your next favourite place belongs here.
                  </h2>
                  <p className="mt-3 text-muted">
                    Save a recommendation, a must-see or a little maybe.
                  </p>
                  <Button className="mt-6" onClick={startIdea}>
                    Save my first idea
                  </Button>
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {tripIdeas.map((idea) => (
                    <Card key={idea.id} className="flex flex-col">
                      <CardContent className="flex flex-1 flex-col">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="rounded-full bg-sky px-3 py-1.5 text-xs font-semibold">
                            {idea.category}
                          </span>
                          <span className="text-sm text-muted">{idea.city}</span>
                        </div>

                        <h2 className="mt-5 break-words text-2xl font-semibold">
                          {idea.title}
                        </h2>

                        {idea.notes && (
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                            {idea.notes}
                          </p>
                        )}

                        <div className="mt-5 flex gap-2">
                          <Button variant="ghost" onClick={() => editIdea(idea)}>
                            Edit
                          </Button>
                          <Button variant="ghost" onClick={() => removeIdea(idea)}>
                            Remove
                          </Button>
                        </div>

                        <div className="mt-auto pt-6">
                          <label
                            htmlFor={`day-${idea.id}`}
                            className="text-sm font-semibold"
                          >
                            Find it a day
                          </label>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <select
                              id={`day-${idea.id}`}
                              value={selectedDays[idea.id] ?? "1"}
                              onChange={(event) =>
                                setSelectedDays((current) => ({
                                  ...current,
                                  [idea.id]: event.target.value,
                                }))
                              }
                              className="min-h-11 rounded-full border border-foreground/20 bg-background px-4 py-2 text-sm"
                            >
                              {Array.from({ length: dayCount }, (_, index) => (
                                <option key={index} value={index + 1}>
                                  Day {index + 1}
                                </option>
                              ))}
                            </select>

                            <Button onClick={() => scheduleIdea(idea)}>
                              Add to day ↗
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
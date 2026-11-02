import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "A journey shared with you — Roam",
  robots: {
    index: false,
    follow: false,
  },
};

type Activity = {
  id: string;
  day: number;
  title: string;
  city: string;
  time: string;
  duration: number;
};

type SharedTrip = {
  name: string;
  cities: string[];
  startDate: string;
  endDate: string;
  activities: Activity[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSharedTrip(value: unknown): SharedTrip {
  if (
    !isObject(value) ||
    typeof value.name !== "string" ||
    !Array.isArray(value.cities) ||
    !value.cities.every((city) => typeof city === "string") ||
    !Array.isArray(value.activities)
  ) {
    throw new Error("This itinerary couldn’t be displayed.");
  }

  const activities = value.activities.map((activity): Activity => {
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
      throw new Error("This itinerary contains an unreadable activity.");
    }

    return {
      id: activity.id,
      day: Number(activity.day),
      title: activity.title,
      city: activity.city,
      time: activity.time,
      duration: activity.duration,
    };
  });

  return {
    name: value.name,
    cities: value.cities,
    startDate: typeof value.startDate === "string" ? value.startDate : "",
    endDate: typeof value.endDate === "string" ? value.endDate : "",
    activities,
  };
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

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return [
    hours ? `${hours}h` : "",
    remainder ? `${remainder}m` : "",
  ].filter(Boolean).join(" ");
}

export default async function SharedItineraryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
  ) {
    notFound();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Roam’s connection settings are missing.");
  }

  // This public reader uses no visitor login session.
  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });

  const { data, error } = await supabase.rpc("read_shared_itinerary", {
    share_token: token,
  });

  if (error) {
    throw new Error("The shared itinerary couldn’t be loaded.");
  }

  if (data === null) {
    notFound();
  }

  const trip = readSharedTrip(data);

  const days = [...new Set(trip.activities.map((activity) => activity.day))]
    .sort((a, b) => a - b);

  const startDate = dateLabel(trip.startDate);
  const endDate = dateLabel(trip.endDate);

  return (
    <div className="min-h-screen">
      <header className="border-b border-foreground/10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <a href="/" className="text-3xl font-bold tracking-tight">
            roam<span className="text-terracotta">.</span>
          </a>

          <span className="rounded-full bg-sky px-4 py-2 text-xs font-semibold">
            Shared itinerary · Read only
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          A journey shared with you
        </p>

        <h1 className="mt-4 break-words text-4xl font-semibold tracking-tight sm:text-6xl">
          {trip.name}
        </h1>

        <p className="mt-5 text-muted">
          {startDate && endDate
            ? `${startDate} – ${endDate}`
            : "Dates flexible"}
        </p>

        <section aria-label="Destinations" className="mt-8">
          <ol className="flex flex-wrap gap-3">
            {trip.cities.map((city, index) => (
              <li
                key={`${city}-${index}`}
                className="rounded-2xl bg-sky px-5 py-4"
              >
                <span className="mr-3 text-sm font-bold text-terracotta">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="font-semibold">{city}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Day-by-day itinerary" className="mt-12 space-y-10">
          {days.length === 0 ? (
            <Card>
              <CardContent>
                <h2 className="text-2xl font-semibold">
                  The adventure is taking shape.
                </h2>
                <p className="mt-3 text-muted">
                  Day-by-day activities haven’t been added yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            days.map((day) => {
              const activities = trip.activities
                .filter((activity) => activity.day === day)
                .sort((a, b) => {
                  if (!a.time && !b.time) return 0;
                  if (!a.time) return 1;
                  if (!b.time) return -1;
                  return a.time.localeCompare(b.time);
                });

              return (
                <section key={day} aria-labelledby={`day-${day}`}>
                  <h2
                    id={`day-${day}`}
                    className="text-2xl font-semibold tracking-tight"
                  >
                    Day {day}
                  </h2>

                  <ol className="mt-5 space-y-4">
                    {activities.map((activity) => (
                      <li key={activity.id}>
                        <Card>
                          <CardContent>
                            <p className="text-sm font-semibold text-terracotta">
                              {activity.time || "Any time"}
                              {" · "}
                              {durationLabel(activity.duration)}
                            </p>

                            <h3 className="mt-2 break-words text-xl font-semibold">
                              {activity.title}
                            </h3>

                            <p className="mt-2 text-sm text-muted">
                              {activity.city}
                            </p>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })
          )}
        </section>

        <div className="mt-14 rounded-3xl bg-[#e4e9d9] p-7">
          <h2 className="text-2xl font-semibold">
            Your own adventure is waiting.
          </h2>
          <p className="mt-3 text-sm text-muted">
            Plan the trip, keep the magic.
          </p>
          <ButtonLink href="/account" className="mt-5">
            Start with Roam ↗
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
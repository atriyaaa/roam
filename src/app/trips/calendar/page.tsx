"use client";

import { useEffect, useState } from "react";
import { accountStorage } from "@/lib/account-storage";
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

type Activity = {
  id: string;
  day: number;
  title: string;
  city: string;
  time: string;
  duration: number;
  notes: string;
};

type Plans = Record<string, Activity[]>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrips(value: unknown): Trip[] {
  if (!Array.isArray(value)) throw new Error("Invalid trips");

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
  if (!isObject(value)) throw new Error("Invalid plans");

  const plans: Plans = {};

  for (const [id, plan] of Object.entries(value)) {
    if (!isObject(plan) || !Array.isArray(plan.activities)) {
      throw new Error("Invalid plan");
    }

    plans[id] = plan.activities.map((activity): Activity => {
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

      return {
        id: activity.id,
        day: Number(activity.day),
        title: activity.title,
        city: activity.city,
        time: activity.time,
        duration: activity.duration,
        notes:
          typeof activity.notes === "string" ? activity.notes : "",
      };
    });
  }

  return plans;
}

function dateForDay(startDate: string, day: number): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;

  const date = new Date(`${startDate}T00:00:00Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== startDate
  ) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + day - 1);

  return Number.isNaN(date.getTime()) ? null : date;
}

function dateLabel(startDate: string, day: number) {
  const date = dateForDay(startDate, day);

  return date
    ? date.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Set trip dates first";
}

function calendarDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

// Escape text according to the iCalendar format.
function escapeText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

// Fold long lines without splitting a UTF-8 character.
function foldLine(value: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let line = "";
  let bytes = 0;

  for (const character of value) {
    const size = encoder.encode(character).length;

    if (bytes + size > 75) {
      lines.push(line);
      line = ` ${character}`;
      bytes = 1 + size;
    } else {
      line += character;
      bytes += size;
    }
  }

  lines.push(line);
  return lines.join("\r\n");
}

function sortActivities(activities: Activity[]) {
  return [...activities].sort((a, b) => {
    if (!a.time && !b.time) return 0;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
}

function createCalendar(
  trip: Trip,
  activities: Activity[],
  includeNotes: boolean,
) {
  if (!trip.startDate || !trip.endDate) {
    throw new Error("Set your trip’s start and end dates first.");
  }

  const endDate = dateForDay(trip.endDate, 1);

  if (!endDate || trip.endDate < trip.startDate) {
    throw new Error("Check your trip dates before exporting.");
  }

  const days = [...new Set(activities.map((activity) => activity.day))]
    .sort((a, b) => a - b);

  if (days.length === 0) {
    throw new Error("Add at least one activity before exporting.");
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Roam//Trip Calendar//EN",
    "CALSCALE:GREGORIAN",
  ];

  for (const day of days) {
    const start = dateForDay(trip.startDate, day);

    if (!start) {
      throw new Error("Check your trip’s start date.");
    }

    if (start > endDate) {
      throw new Error(
        `Day ${day} falls after your trip ends. Adjust the trip dates or move its activities before exporting.`,
      );
    }

    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const dayActivities = sortActivities(
      activities.filter((activity) => activity.day === day),
    );

    const cities = [
      ...new Set(dayActivities.map((activity) => activity.city)),
    ];

    const description = [
      `Day ${day} of ${trip.name}`,
      "",
      ...dayActivities.flatMap((activity) => [
        `${activity.time || "Any time"} — ${activity.title}`,
        `${activity.city} · ${activity.duration} minutes`,
        ...(includeNotes && activity.notes ? [activity.notes] : []),
        "",
      ]),
      "Exported from Roam. Changes made later won’t sync automatically.",
    ].join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${encodeURIComponent(trip.id)}-day-${day}@roam.local`,
      `DTSTAMP:${timestamp}`,
      `DTSTART;VALUE=DATE:${calendarDate(start)}`,
      `DTEND;VALUE=DATE:${calendarDate(end)}`,
      `SUMMARY:${escapeText(`${trip.name} — Day ${day}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      `LOCATION:${escapeText(cities.join(", "))}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export default function CalendarPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [plans, setPlans] = useState<Plans>({});
  const [tripId, setTripId] = useState("");
  const [includeNotes, setIncludeNotes] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      const loadedTrips = readTrips(
        JSON.parse(accountStorage.getItem("roam.trips.v1") ?? "[]"),
      );

      setTrips(loadedTrips);
      setPlans(
        readPlans(
          JSON.parse(accountStorage.getItem("roam.plans.v1") ?? "{}"),
        ),
      );
      setTripId(loadedTrips[0]?.id ?? "");
      setReady(true);
    } catch {
      setError("Your saved itinerary couldn’t be loaded. Try refreshing.");
    }
  }, []);

  const trip = trips.find((item) => item.id === tripId);
  const activities = plans[tripId] ?? [];
  const days = [...new Set(activities.map((activity) => activity.day))]
    .sort((a, b) => a - b);

  function downloadCalendar() {
    if (!trip) return;

    setError("");
    setNotice("");

    try {
      const contents = createCalendar(trip, activities, includeNotes);
      const blob = new Blob([contents], {
        type: "text/calendar;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const filename = trip.name
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "roam-trip";

      link.href = url;
      link.download = `${filename}.ics`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 10000);

      setNotice(
        "Your calendar file is ready. Open the downloaded file or import it into your calendar.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The calendar file couldn’t be created.",
      );
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          Make a little space for adventure
        </p>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Meet you in the calendar.
        </h1>

        <p className="mt-4 leading-relaxed text-muted">
          Keep each planned day alongside the rest of your life.
          Export your itinerary to a calendar file.
        </p>

        {!ready && !error && (
          <p role="status" className="mt-8">
            Loading your trips…
          </p>
        )}

        {ready && !trip && (
          <ButtonLink href="/trips" className="mt-8">
            Create a trip first
          </ButtonLink>
        )}

        {ready && trip && (
          <>
            <Card className="mt-8">
              <CardContent className="sm:p-8">
                <label
                  htmlFor="calendar-trip"
                  className="text-sm font-semibold"
                >
                  Choose your trip
                </label>

                <select
                  id="calendar-trip"
                  value={tripId}
                  onChange={(event) => {
                    setTripId(event.target.value);
                    setIncludeNotes(false);
                    setError("");
                    setNotice("");
                  }}
                  className="mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3"
                >
                  {trips.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>

                <div className="mt-6 rounded-2xl bg-sky p-5">
                  <p className="font-semibold">
                    {days.length} planned days · {activities.length} activities
                  </p>

                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    One all-day event per planned day. Activity
                    times appear in the event description, rather
                    than as individual timed appointments.
                  </p>
                </div>

                <label className="mt-6 flex cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={includeNotes}
                    onChange={(event) => setIncludeNotes(event.target.checked)}
                    className="h-4 w-4 accent-terracotta"
                  />
                  Include personal activity notes
                </label>

                <p className="mt-3 text-xs leading-relaxed text-muted">
                  Budget figures and booking references aren’t included.
                  Check which calendar you import into before including notes.
                </p>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    onClick={downloadCalendar}
                    disabled={days.length === 0}
                  >
                    Download calendar ↗
                  </Button>

                  <ButtonLink
                    href="/trips/itinerary"
                    variant="secondary"
                  >
                    Edit itinerary
                  </ButtonLink>
                </div>

                {(!trip.startDate || !trip.endDate) && (
                  <p className="mt-4 text-sm text-terracotta">
                    Your trip needs fixed dates before it can be exported.
                    Add them in My trips.
                  </p>
                )}

                {days.length > 0 && (
                  <ul className="mt-7 divide-y divide-foreground/10">
                    {days.map((day) => (
                      <li
                        key={day}
                        className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                      >
                        <span className="font-semibold">Day {day}</span>
                        <span className="text-muted">
                          {dateLabel(trip.startDate, day)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <section className="mt-6 rounded-3xl bg-[#e4e9d9] p-6">
              <h2 className="text-xl font-semibold">Bring it into your calendar</h2>

              <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-relaxed">
                <li>
                  Apple Calendar: open the downloaded file and choose
                  the calendar you want to add it to.
                </li>
                <li>
                  Google Calendar: on a computer, open Settings →
                  Import &amp; export, then import the file.
                </li>
                <li>
                  Outlook: use its calendar import or upload-from-file option.
                </li>
              </ul>

              <p className="mt-5 text-xs leading-relaxed text-muted">
                This is a one-time export, not a subscription. Later
                edits in Roam won’t update imported events. Repeated
                imports may create duplicates.
              </p>
            </section>
          </>
        )}

        {error && (
          <p role="alert" className="mt-5 text-sm text-terracotta">
            {error}
          </p>
        )}

        <p role="status" className="mt-5 text-sm text-muted">
          {notice}
        </p>
      </main>
    </div>
  );
}
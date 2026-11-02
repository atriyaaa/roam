"use client";

import { useEffect, useRef, useState } from "react";
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

type SavedPlace = {
  latitude: number;
  longitude: number;
};

type Locations = Record<string, Record<string, SavedPlace>>;

type ForecastDay = {
  date: string;
  code: number | null;
  high: number | null;
  low: number | null;
  precipitation: number | null;
};

type Forecast = {
  timezone: string;
  days: ForecastDay[];
};

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

function readLocations(value: unknown): Locations {
  if (!isObject(value)) {
    throw new Error("Invalid locations");
  }

  const result: Locations = {};

  for (const [tripId, places] of Object.entries(value)) {
    if (!isObject(places)) {
      throw new Error("Invalid locations");
    }

    result[tripId] = {};

    for (const [key, place] of Object.entries(places)) {
      if (
        !isObject(place) ||
        typeof place.latitude !== "number" ||
        typeof place.longitude !== "number" ||
        !Number.isFinite(place.latitude) ||
        !Number.isFinite(place.longitude) ||
        Math.abs(place.latitude) > 90 ||
        Math.abs(place.longitude) > 180
      ) {
        throw new Error("Invalid location");
      }

      result[tripId][key] = {
        latitude: place.latitude,
        longitude: place.longitude,
      };
    }
  }

  return result;
}

function readForecast(value: unknown): Forecast {
  if (
    !isObject(value) ||
    typeof value.timezone !== "string" ||
    !Array.isArray(value.days) ||
    value.days.length === 0
  ) {
    throw new Error("The forecast couldn’t be read.");
  }

  const days = value.days.map((day): ForecastDay => {
    if (
      !isObject(day) ||
      typeof day.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day.date)
    ) {
      throw new Error("Invalid forecast day.");
    }

    function numberOrNull(field: string) {
      const number = day[field];

      if (number === null) return null;

      if (typeof number !== "number" || !Number.isFinite(number)) {
        throw new Error("Invalid weather value.");
      }

      return number;
    }

    return {
      date: day.date,
      code: numberOrNull("code"),
      high: numberOrNull("high"),
      low: numberOrNull("low"),
      precipitation: numberOrNull("precipitation"),
    };
  });

  return { timezone: value.timezone, days };
}

function weatherLabel(code: number | null) {
  if (code === null) return "Conditions unavailable";
  if (code === 0) return "Clear skies";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55].includes(code)) return "Drizzle";
  if ([56, 57].includes(code)) return "Freezing drizzle";
  if ([61, 63, 65].includes(code)) return "Rain";
  if ([66, 67].includes(code)) return "Freezing rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Mixed conditions";
}

function weatherIcon(code: number | null) {
  if (code === 0 || code === 1) return "☀️";
  if (code === 2) return "🌤️";
  if (code !== null && [71, 73, 75, 77, 85, 86].includes(code)) {
    return "❄️";
  }
  if (code !== null && [95, 96, 99].includes(code)) {
    return "⛈️";
  }
  if (code !== null && code >= 51) return "🌧️";
  return "☁️";
}

function dateLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function temperature(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}°`;
}

export default function WeatherPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [locations, setLocations] = useState<Locations>({});
  const [tripId, setTripId] = useState("");
  const [city, setCity] = useState("");
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");

  const requestRef = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    try {
      const loadedTrips = readTrips(
        JSON.parse(accountStorage.getItem("roam.trips.v1") ?? "[]"),
      );

      const loadedLocations = readLocations(
        JSON.parse(accountStorage.getItem("roam.locations.v1") ?? "{}"),
      );

      setTrips(loadedTrips);
      setLocations(loadedLocations);
      setTripId(loadedTrips[0]?.id ?? "");
      setCity(loadedTrips[0]?.cities[0] ?? "");
      setReady(true);
    } catch {
      setLoadError(
        "Your saved trips or city locations couldn’t be loaded. Reload before continuing.",
      );
    }

    return () => requestRef.current?.abort();
  }, []);

  const trip = trips.find((item) => item.id === tripId);
  const place = locations[tripId]?.[`city:${city}`];

  const selectedDay = forecast?.days.find(
    (day) => day.date === selectedDate,
  );

  const hasTripDates = Boolean(trip?.startDate && trip?.endDate);

  function duringTrip(date: string) {
    return Boolean(
      trip?.startDate &&
        trip?.endDate &&
        date >= trip.startDate &&
        date <= trip.endDate,
    );
  }

  const coveredDays = forecast?.days.filter(
    (day) => duringTrip(day.date),
  ).length ?? 0;

  const wetDay = Boolean(
    selectedDay &&
      (
        (selectedDay.precipitation ?? 0) >= 50 ||
        (selectedDay.code !== null && selectedDay.code >= 51)
      ),
  );

  function resetForecast() {
    requestVersion.current += 1;
    requestRef.current?.abort();
    setForecast(null);
    setSelectedDate("");
    setBusy(false);
    setError("");
  }

  async function loadForecast() {
    if (!place || busy) return;

    const version = ++requestVersion.current;
    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    setBusy(true);
    setForecast(null);
    setSelectedDate("");
    setError("");

    try {
      const params = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
      });

      const response = await fetch(`/api/weather?${params}`, {
        signal: controller.signal,
      });

      const data: unknown = await response.json();

      if (version !== requestVersion.current) return;

      if (!response.ok) {
        throw new Error(
          isObject(data) && typeof data.error === "string"
            ? data.error
            : "The forecast couldn’t be loaded.",
        );
      }

      const loaded = readForecast(data);
      const firstTripDay = loaded.days.find(
        (day) => duringTrip(day.date),
      );

      setForecast(loaded);
      setSelectedDate(firstTripDay?.date ?? loaded.days[0].date);
    } catch (caught) {
      if (controller.signal.aborted || version !== requestVersion.current) {
        return;
      }

      setError(
        caught instanceof Error
          ? caught.message
          : "The forecast couldn’t be loaded.",
      );
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          A little sunshine. A little flexibility.
        </p>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Plan around the skies.
        </h1>

        <p className="mt-4 max-w-xl leading-relaxed text-muted">
          Check your destination’s forecast and keep a few lovely
          indoor ideas in your back pocket.
        </p>

        {!ready && !loadError && (
          <p role="status" className="mt-8">
            Loading your destinations…
          </p>
        )}

        {loadError && (
          <p role="alert" className="mt-8 text-terracotta">
            {loadError}
          </p>
        )}

        {ready && !trip && (
          <div className="mt-8">
            <ButtonLink href="/trips">Create a trip first</ButtonLink>
          </div>
        )}

        {ready && trip && (
          <>
            <div className="mt-8 grid max-w-3xl gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="weather-trip" className="text-sm font-semibold">
                  Choose your trip
                </label>

                <select
                  id="weather-trip"
                  value={tripId}
                  className={inputStyles}
                  onChange={(event) => {
                    const id = event.target.value;
                    resetForecast();
                    setTripId(id);
                    setCity(
                      trips.find((item) => item.id === id)?.cities[0] ?? "",
                    );
                  }}
                >
                  {trips.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="weather-city" className="text-sm font-semibold">
                  Destination
                </label>

                <select
                  id="weather-city"
                  value={city}
                  className={inputStyles}
                  onChange={(event) => {
                    resetForecast();
                    setCity(event.target.value);
                  }}
                >
                  {[...new Set(trip.cities)].map((destination) => (
                    <option key={destination} value={destination}>
                      {destination}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!place ? (
              <Card className="mt-7">
                <CardContent>
                  <h2 className="text-xl font-semibold">
                    Put {city || "this destination"} on the map first.
                  </h2>

                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    Save a destination pin for this city so Roam can
                    request weather for the right location.
                  </p>

                  <ButtonLink href="/trips/map" className="mt-5">
                    Open map ↗
                  </ButtonLink>
                </CardContent>
              </Card>
            ) : (
              <Button
                className="mt-6"
                disabled={busy}
                onClick={loadForecast}
              >
                {busy ? "Checking the skies…" : `Show forecast for ${city}`}
              </Button>
            )}

            {busy && (
              <p role="status" className="mt-4 text-sm text-muted">
                Loading the latest available forecast…
              </p>
            )}

            {error && (
              <p role="alert" className="mt-5 text-sm text-terracotta">
                {error}
              </p>
            )}

            {forecast && (
              <>
                <div className="mt-8 rounded-3xl bg-sky p-6">
                  <h2 className="text-xl font-semibold">
                    The next seven days in {city}
                  </h2>

                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {hasTripDates
                      ? coveredDays > 0
                        ? "Trip dates within this forecast are marked below. Dates further away aren’t available yet."
                        : "This forecast doesn’t cover your trip dates. These are the next seven days, not a forecast for your trip."
                      : "Your trip dates are flexible. This is the forecast for the next seven days."}
                  </p>

                  <p className="mt-3 text-xs text-muted">
                    Destination timezone: {forecast.timezone} · Temperatures in °C
                  </p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {forecast.days.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      aria-pressed={selectedDate === day.date}
                      onClick={() => setSelectedDate(day.date)}
                      className={`rounded-3xl border p-5 text-left transition ${
                        selectedDate === day.date
                          ? "border-terracotta bg-white"
                          : "border-foreground/10 bg-white/60 hover:bg-white"
                      }`}
                    >
                      <p className="text-sm font-semibold">
                        {dateLabel(day.date)}
                      </p>

                      <span aria-hidden="true" className="mt-4 block text-3xl">
                        {weatherIcon(day.code)}
                      </span>

                      <p className="mt-3 font-semibold">
                        {weatherLabel(day.code)}
                      </p>

                      <p className="mt-2 text-xl font-semibold">
                        {temperature(day.high)}
                        <span className="ml-2 text-base font-normal text-muted">
                          {temperature(day.low)}
                        </span>
                      </p>

                      <p className="mt-2 text-xs text-muted">
                        Precipitation chance:{" "}
                        {day.precipitation === null
                          ? "Unavailable"
                          : `${Math.round(day.precipitation)}%`}
                      </p>

                      {duringTrip(day.date) && (
                        <span className="mt-3 inline-block rounded-full bg-sky px-3 py-1 text-xs font-semibold">
                          During your trip
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {selectedDay && (
                  <Card className="mt-8">
                    <CardContent className="sm:p-8">
                      <p className="text-xs font-bold uppercase tracking-widest text-terracotta">
                        {dateLabel(selectedDay.date)}
                      </p>

                      <h2 className="mt-3 text-2xl font-semibold">
                        {wetDay
                          ? "A good day for an indoor detour."
                          : "Keep a little flexibility in your day."}
                      </h2>

                      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                        {wetDay
                          ? "Wet weather is possible. These are general indoor ideas to explore in your destination."
                          : "Even with a promising forecast, it’s useful to have a few indoor options ready."}
                      </p>

                      <div className="mt-6 grid gap-4 md:grid-cols-3">
                        {[
                          {
                            title: "A museum morning",
                            text: "Look for a local gallery or museum that fits your interests.",
                          },
                          {
                            title: "A slow café stop",
                            text: "Swap an outdoor break for coffee, a book and a window seat.",
                          },
                          {
                            title: "Something hands-on",
                            text: "Explore an indoor cooking class, craft workshop or tasting.",
                          },
                        ].map((idea) => (
                          <div
                            key={idea.title}
                            className="rounded-2xl bg-background p-5"
                          >
                            <h3 className="font-semibold">{idea.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted">
                              {idea.text}
                            </p>
                          </div>
                        ))}
                      </div>

                      <p className="mt-5 text-xs leading-relaxed text-muted">
                        These aren’t verified venue recommendations.
                        Check opening hours, availability and local conditions.
                      </p>

                      <ButtonLink
                        href="/trips/wishlist"
                        variant="secondary"
                        className="mt-5"
                      >
                        Save an idea in your wishlist ↗
                      </ButtonLink>
                    </CardContent>
                  </Card>
                )}

                <p className="mt-6 text-xs leading-relaxed text-muted">
                  Weather data by{" "}
                  <a
                    href="https://open-meteo.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    Open-Meteo
                  </a>
                  . Forecasts can change. Roam doesn’t move or
                  reschedule your activities automatically.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
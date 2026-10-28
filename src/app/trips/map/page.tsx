"use client";

import { accountStorage as localStorage } from "@/lib/account-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { SiteHeader } from "@/components/site-header";
import { TripMap } from "@/components/trip-map";
import type { MapPin } from "@/components/trip-map";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Trip = {
  id: string;
  name: string;
  cities: string[];
};

type Activity = {
  id: string;
  title: string;
  city: string;
  day: number;
};

type Place = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
};

type SavedLocations = Record<string, Record<string, Place>>;

const LOCATIONS_KEY = "roam.locations.v1";

const inputStyles =
  "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlace(value: unknown): value is Place {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.longitude) <= 180 &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    Math.abs(value.latitude) <= 90
  );
}

export default function MapPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activities, setActivities] = useState<Record<string, Activity[]>>({});
  const [locations, setLocations] = useState<SavedLocations>({});
  const [tripId, setTripId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searched, setSearched] = useState(false);

  const searchVersion = useRef(0);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const rawTrips: unknown = JSON.parse(
        localStorage.getItem("roam.trips.v1") ?? "[]",
      );
      const rawPlans: unknown = JSON.parse(
        localStorage.getItem("roam.plans.v1") ?? "{}",
      );
      const rawLocations: unknown = JSON.parse(
        localStorage.getItem(LOCATIONS_KEY) ?? "{}",
      );

      if (
        !Array.isArray(rawTrips) ||
        !isRecord(rawPlans) ||
        !isRecord(rawLocations)
      ) {
        throw new Error("Invalid saved data");
      }

      const loadedTrips: Trip[] = rawTrips.map((trip) => {
        if (
          !isRecord(trip) ||
          typeof trip.id !== "string" ||
          typeof trip.name !== "string" ||
          !Array.isArray(trip.cities) ||
          !trip.cities.every((city) => typeof city === "string")
        ) {
          throw new Error("Invalid trip");
        }

        return { id: trip.id, name: trip.name, cities: trip.cities };
      });

      const loadedActivities: Record<string, Activity[]> = {};

      for (const [id, plan] of Object.entries(rawPlans)) {
        if (!isRecord(plan) || !Array.isArray(plan.activities)) {
          throw new Error("Invalid plan");
        }

        loadedActivities[id] = plan.activities.map((activity) => {
          if (
            !isRecord(activity) ||
            typeof activity.id !== "string" ||
            typeof activity.title !== "string" ||
            typeof activity.city !== "string" ||
            !Number.isInteger(activity.day) ||
            Number(activity.day) < 1
          ) {
            throw new Error("Invalid activity");
          }

          return {
            id: activity.id,
            title: activity.title,
            city: activity.city,
            day: Number(activity.day),
          };
        });
      }

      const loadedLocations: SavedLocations = {};

      for (const [id, places] of Object.entries(rawLocations)) {
        if (!isRecord(places)) throw new Error("Invalid locations");

        loadedLocations[id] = {};

        for (const [target, place] of Object.entries(places)) {
          if (!isPlace(place)) throw new Error("Invalid location");
          loadedLocations[id][target] = place;
        }
      }

      setTrips(loadedTrips);
      setActivities(loadedActivities);
      setLocations(loadedLocations);
      setTripId(loadedTrips[0]?.id ?? "");
    } catch {
      setLoadError(
        "Your saved trips or locations couldn’t be loaded. Reload before making changes.",
      );
    } finally {
      setReady(true);
    }

    return () => requestRef.current?.abort();
  }, []);

  const trip = trips.find((item) => item.id === tripId);

  const targets = useMemo(() => {
    if (!trip) return [];

    return [
      ...[...new Set(trip.cities)].map((city) => ({
        id: `city:${city}`,
        title: city,
        description: "Destination",
        suggestion: city,
        kind: "city" as const,
      })),
      ...[...(activities[tripId] ?? [])]
        .sort((a, b) => a.day - b.day)
        .map((activity) => ({
          id: `activity:${activity.id}`,
          title: activity.title,
          description: `Day ${activity.day} · ${activity.city}`,
          suggestion: `${activity.title}, ${activity.city}`,
          kind: "activity" as const,
        })),
    ];
  }, [trip, tripId, activities]);

  const pins = useMemo<MapPin[]>(() => {
    return targets.flatMap((target) => {
      const place = locations[tripId]?.[target.id];

      return place
        ? [{
            id: target.id,
            title: target.title,
            kind: target.kind,
            label: place.label,
            longitude: place.longitude,
            latitude: place.latitude,
          }]
        : [];
    });
  }, [targets, locations, tripId]);

  const selectedTarget = targets.find((target) => target.id === targetId);

  function resetSearch() {
    searchVersion.current += 1;
    requestRef.current?.abort();
    setBusy(false);
    setResults([]);
    setSearched(false);
    setError("");
    setNotice("");
  }

  function selectTarget(id: string) {
    resetSearch();
    setTargetId(id);
    setQuery(targets.find((target) => target.id === id)?.suggestion ?? "");
  }

  async function searchPlaces(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTarget || query.trim().length < 3) {
      setError("Choose something to pin and enter at least three characters.");
      return;
    }

    const version = ++searchVersion.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    setBusy(true);
    setError("");
    setNotice("");
    setResults([]);
    setSearched(false);

    try {
      const response = await fetch(
        `/api/places?q=${encodeURIComponent(query.trim())}`,
        { signal: controller.signal },
      );

      const data: unknown = await response.json();

      if (version !== searchVersion.current) return;

      if (!response.ok) {
        throw new Error(
          isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Place search couldn’t finish.",
        );
      }

      if (
        !isRecord(data) ||
        !Array.isArray(data.places) ||
        !data.places.every(isPlace)
      ) {
        throw new Error("Search returned an unexpected result.");
      }

      setResults(data.places);
      setSearched(true);
    } catch (caught) {
      if (controller.signal.aborted || version !== searchVersion.current) return;
      setError(caught instanceof Error ? caught.message : "Search couldn’t finish.");
    } finally {
      if (version === searchVersion.current) setBusy(false);
    }
  }

  function persistLocations(updated: SavedLocations) {
    try {
      localStorage.setItem(LOCATIONS_KEY, JSON.stringify(updated));
      setLocations(updated);
      setError("");
      return true;
    } catch {
      setError("Your pins couldn’t be saved. Check browser storage and try again.");
      return false;
    }
  }

  function savePlace(place: Place) {
    if (!selectedTarget) return;

    const updated = {
      ...locations,
      [tripId]: {
        ...(locations[tripId] ?? {}),
        [selectedTarget.id]: place,
      },
    };

    if (persistLocations(updated)) {
      setNotice(`${selectedTarget.title} pinned.`);
      setResults([]);
      setSearched(false);
    }
  }

  function removePin() {
    if (!selectedTarget) return;

    const tripLocations = { ...(locations[tripId] ?? {}) };
    delete tripLocations[selectedTarget.id];

    if (persistLocations({ ...locations, [tripId]: tripLocations })) {
      setNotice("Location removed. Your destination or activity is unchanged.");
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          Put your plans on the map
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          See your journey take shape.
        </h1>
        <p className="mt-4 max-w-xl leading-relaxed text-muted">
          Choose a destination or activity, search for its location
          and save the right spot.
        </p>

        {!ready && <p role="status" className="mt-8">Loading your places…</p>}
        {loadError && <p role="alert" className="mt-8 text-terracotta">{loadError}</p>}

        {ready && !loadError && !trip && (
          <div className="mt-8">
            <ButtonLink href="/trips">Create your first trip</ButtonLink>
          </div>
        )}

        {ready && !loadError && trip && (
          <>
            <div className="mt-8 max-w-md">
              <label htmlFor="map-trip" className="text-sm font-semibold">
                Choose your trip
              </label>
              <select
                id="map-trip"
                value={tripId}
                onChange={(event) => {
                  resetSearch();
                  setTripId(event.target.value);
                  setTargetId("");
                  setQuery("");
                }}
                className={inputStyles}
              >
                {trips.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

            <div className="mt-8 grid items-start gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
              <aside>
                <Card>
                  <CardContent>
                    <h2 className="text-xl font-semibold">Find your places</h2>
                    <p className="mt-2 text-sm text-muted">
                      {pins.length} of {targets.length} places pinned
                    </p>

                    <form onSubmit={searchPlaces} className="mt-5 space-y-5">
                      <div>
                        <label htmlFor="map-target" className="text-sm font-semibold">
                          What would you like to pin?
                        </label>
                        <select
                          id="map-target"
                          value={targetId}
                          onChange={(event) => selectTarget(event.target.value)}
                          required
                          className={inputStyles}
                        >
                          <option value="">Choose a destination or activity</option>
                          {targets.map((target) => (
                            <option key={target.id} value={target.id}>
                              {locations[tripId]?.[target.id] ? "✓ " : ""}
                              {target.title} — {target.description}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor="place-query" className="text-sm font-semibold">
                          Place or address
                        </label>
                        <input
                          id="place-query"
                          value={query}
                          onChange={(event) => {
                            resetSearch();
                            setQuery(event.target.value);
                          }}
                          placeholder="Belém Tower, Lisbon, Portugal"
                          minLength={3}
                          maxLength={200}
                          required
                          className={inputStyles}
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={busy || !selectedTarget}
                        className="w-full"
                      >
                        {busy ? "Searching…" : "Search"}
                      </Button>
                    </form>

                    <p role="status" className="mt-4 text-sm text-muted">
                      {busy ? "Looking for matching places…" : notice}
                    </p>

                    {error && (
                      <p role="alert" className="mt-3 text-sm text-terracotta">
                        {error}
                      </p>
                    )}

                    {searched && results.length === 0 && (
                      <p className="mt-4 text-sm text-muted">
                        No matches. Try a landmark name, street address,
                        or add the city and country.
                      </p>
                    )}

                    {results.length > 0 && (
                      <ul aria-label="Search results" className="mt-4 space-y-3">
                        {results.map((place) => (
                          <li key={place.id}>
                            <button
                              type="button"
                              onClick={() => savePlace(place)}
                              className="w-full rounded-2xl border border-foreground/15 p-4 text-left text-sm transition hover:bg-sky"
                            >
                              <span className="block leading-relaxed">{place.label}</span>
                              <span className="mt-2 block font-semibold text-terracotta">
                                Save this location ↗
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {selectedTarget && locations[tripId]?.[selectedTarget.id] && (
                      <div className="mt-5 border-t border-foreground/10 pt-5">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                          Saved location
                        </p>
                        <p className="mt-2 text-sm leading-relaxed">
                          {locations[tripId][selectedTarget.id].label}
                        </p>
                        <Button variant="ghost" className="mt-3" onClick={removePin}>
                          Remove pin
                        </Button>
                      </div>
                    )}

                    <p className="mt-5 text-xs leading-relaxed text-muted">
                      Search by{" "}
                      <a
                        href="https://github.com/komoot/photon"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Photon
                      </a>
                      . Place data ©{" "}
                      <a
                        href="https://www.openstreetmap.org/copyright"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        OpenStreetMap contributors
                      </a>
                      .
                    </p>
                  </CardContent>
                </Card>
              </aside>

              <div className="min-w-0">
                <TripMap key={tripId} pins={pins} />

                {pins.length === 0 && (
                  <p className="mt-4 rounded-2xl bg-sky p-4 text-sm">
                    Your map is ready. Save your first location to
                    bring this trip into view.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { accountStorage } from "@/lib/account-storage";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type JsonObject = Record<string, unknown>;

type LocalTrip = JsonObject & {
  id: string;
  name: string;
  cities: string[];
  createdAt: string;
};

type TripSnapshot = {
  version: 1;
  trip: LocalTrip;
  plan: JsonObject | null;
  wishlist: JsonObject[];
  bookings: JsonObject[];
  budget: JsonObject | null;
  locations: JsonObject | null;
};

type CloudTrip = {
  id: string;
  name: string;
  revision: number;
  updated_at: string;
};

const keys = {
  trips: "roam.trips.v1",
  plans: "roam.plans.v1",
  wishlist: "roam.wishlist.v1",
  bookings: "roam.bookings.v1",
  budgets: "roam.budgets.v1",
  locations: "roam.locations.v1",
  revisions: "roam.cloud-revisions.v1",
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readList(key: string): JsonObject[] {
  const value: unknown = JSON.parse(accountStorage.getItem(key) ?? "[]");

  if (!Array.isArray(value) || !value.every(isObject)) {
    throw new Error("Some browser-saved data couldn’t be read.");
  }

  return value;
}

function readObject(key: string): JsonObject {
  const value: unknown = JSON.parse(accountStorage.getItem(key) ?? "{}");

  if (!isObject(value)) {
    throw new Error("Some browser-saved data couldn’t be read.");
  }

  return value;
}

function isLocalTrip(value: unknown): value is LocalTrip {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.cities) &&
    value.cities.every((city) => typeof city === "string")
  );
}

function readLocalTrips(): LocalTrip[] {
  const trips = readList(keys.trips);

  if (!trips.every(isLocalTrip)) {
    throw new Error("Your browser-saved trips couldn’t be read.");
  }

  return trips;
}

function optionalObject(value: unknown): JsonObject | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) throw new Error("Invalid trip details.");
  return value;
}

function captureTrip(trip: LocalTrip): TripSnapshot {
  return {
    version: 1,
    trip,
    plan: optionalObject(readObject(keys.plans)[trip.id]),
    wishlist: readList(keys.wishlist).filter(
      (idea) => idea.tripId === trip.id,
    ),
    bookings: readList(keys.bookings).filter(
      (booking) => booking.tripId === trip.id,
    ),
    budget: optionalObject(readObject(keys.budgets)[trip.id]),
    locations: optionalObject(readObject(keys.locations)[trip.id]),
  };
}

function readSnapshot(value: unknown, id: string): TripSnapshot {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !isLocalTrip(value.trip) ||
    value.trip.id !== id ||
    !Array.isArray(value.wishlist) ||
    !value.wishlist.every(
      (idea) => isObject(idea) && idea.tripId === id,
    ) ||
    !Array.isArray(value.bookings) ||
    !value.bookings.every(
      (booking) => isObject(booking) && booking.tripId === id,
    )
  ) {
    throw new Error("This cloud trip has an unsupported format.");
  }

  return {
    version: 1,
    trip: value.trip,
    plan: optionalObject(value.plan),
    wishlist: value.wishlist as JsonObject[],
    bookings: value.bookings as JsonObject[],
    budget: optionalObject(value.budget),
    locations: optionalObject(value.locations),
  };
}

function readCloudTrip(value: unknown): CloudTrip {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    typeof value.updated_at !== "string"
  ) {
    throw new Error("A cloud trip couldn’t be read.");
  }

  return {
    id: value.id,
    name: value.name,
    revision: Number(value.revision),
    updated_at: value.updated_at,
  };
}

function restoreSnapshot(snapshot: TripSnapshot, revision: number) {
  const id = snapshot.trip.id;
  const trips = readLocalTrips();
  const existing = trips.some((trip) => trip.id === id);

  const updatedTrips = existing
    ? trips.map((trip) => trip.id === id ? snapshot.trip : trip)
    : [snapshot.trip, ...trips];

  function mergeObject(key: string, value: JsonObject | null) {
    const object = { ...readObject(key) };

    if (value === null) {
      delete object[id];
    } else {
      object[id] = value;
    }

    return object;
  }

  // Prepare all changes before writing anything.
  const updates: Record<string, unknown> = {
    [keys.trips]: updatedTrips,
    [keys.plans]: mergeObject(keys.plans, snapshot.plan),
    [keys.wishlist]: [
      ...readList(keys.wishlist).filter((idea) => idea.tripId !== id),
      ...snapshot.wishlist,
    ],
    [keys.bookings]: [
      ...readList(keys.bookings).filter((booking) => booking.tripId !== id),
      ...snapshot.bookings,
    ],
    [keys.budgets]: mergeObject(keys.budgets, snapshot.budget),
    [keys.locations]: mergeObject(keys.locations, snapshot.locations),
    [keys.revisions]: {
      ...readObject(keys.revisions),
      [id]: revision,
    },
  };

  const previous = Object.fromEntries(
    Object.keys(updates).map((key) => [
      key,
      accountStorage.getItem(key),
    ]),
  );

  // Keep one recovery copy before replacing browser data.
  accountStorage.setItem(
    "roam.restore-backup.v1",
    JSON.stringify(previous),
  );

  try {
    for (const [key, value] of Object.entries(updates)) {
      accountStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    let rollbackFailed = false;

    for (const [key, value] of Object.entries(previous)) {
      try {
        if (value === null) accountStorage.removeItem(key);
        else accountStorage.setItem(key, value);
      } catch {
        rollbackFailed = true;
      }
    }

    throw new Error(
      rollbackFailed
        ? "Restore couldn’t finish. A recovery copy was kept; don’t make further edits yet."
        : "Restore couldn’t finish. Your previous browser data was restored.",
    );
  }
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  if (isObject(value) && typeof value.message === "string") {
    return value.message;
  }
  return "Something went wrong. Please try again.";
}

function dateLabel(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function CloudPage() {
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState("");
  const [localTrips, setLocalTrips] = useState<LocalTrip[]>([]);
  const [cloudTrips, setCloudTrips] = useState<CloudTrip[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const local = readLocalTrips();
        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError || !auth.user) {
          throw new Error("Please log in again.");
        }

        const { data, error: queryError } = await supabase
          .from("roam_trips")
          .select("id, name, revision, updated_at")
          .eq("owner_id", auth.user.id)
          .order("updated_at", { ascending: false });

        if (queryError) throw queryError;

        const cloud = (data ?? []).map(readCloudTrip);

        if (!active) return;

        setUserId(auth.user.id);
        setLocalTrips(local);
        setCloudTrips(cloud);
        setReady(true);
      } catch (caught) {
        if (active) setError(errorMessage(caught));
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [supabase]);

  async function checkAccount() {
    const { data, error: authError } = await supabase.auth.getUser();

    if (authError || !data.user || data.user.id !== userId) {
      throw new Error("Your account changed. Reload this page before continuing.");
    }

    return data.user.id;
  }

  function updateCloudList(row: CloudTrip) {
    setCloudTrips((current) => [
      row,
      ...current.filter((trip) => trip.id !== row.id),
    ]);
  }

  async function saveToCloud(id: string) {
    if (busy) return;

    setBusy(`save:${id}`);
    setError("");
    setNotice("");
    setConfirmRestore(null);

    try {
      const ownerId = await checkAccount();
      const trip = readLocalTrips().find((item) => item.id === id);

      if (!trip) throw new Error("This browser trip no longer exists.");

      const snapshot = captureTrip(trip);
      const existing = cloudTrips.find((item) => item.id === id);
      const revisions = readObject(keys.revisions);

      if (existing && revisions[id] !== existing.revision) {
        throw new Error(
          "This browser hasn’t loaded the latest cloud version. Restore it first. Copy any local-only details you want to keep before replacing them.",
        );
      }

      const values = {
        name: trip.name,
        data: snapshot,
      };

      let saved: unknown;

      if (existing) {
        const { data, error: updateError } = await supabase
          .from("roam_trips")
          .update(values)
          .eq("id", id)
          .eq("owner_id", ownerId)
          .eq("revision", existing.revision)
          .select("id, name, revision, updated_at")
          .maybeSingle();

        if (updateError) throw updateError;

        if (!data) {
          throw new Error(
            "The cloud trip changed elsewhere. Refresh this page and review the latest version before saving.",
          );
        }

        saved = data;
      } else {
        const { data, error: insertError } = await supabase
          .from("roam_trips")
          .insert({
            id,
            owner_id: ownerId,
            ...values,
          })
          .select("id, name, revision, updated_at")
          .single();

        if (insertError) {
          if (insertError.code === "23505") {
            throw new Error(
              "This trip already has a cloud copy. Refresh the page to see it.",
            );
          }
          throw insertError;
        }

        saved = data;
      }

      const row = readCloudTrip(saved);
      updateCloudList(row);

      try {
        accountStorage.setItem(
          keys.revisions,
          JSON.stringify({ ...revisions, [id]: row.revision }),
        );
        setNotice(`${trip.name} is saved to your account.`);
      } catch {
        setError(
          "The cloud save succeeded, but this browser couldn’t record its version. Free some browser storage before making more changes.",
        );
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function restoreFromCloud(id: string) {
    if (busy) return;

    setBusy(`restore:${id}`);
    setError("");
    setNotice("");

    try {
      const ownerId = await checkAccount();

      const { data, error: queryError } = await supabase
        .from("roam_trips")
        .select("id, name, revision, updated_at, data")
        .eq("id", id)
        .eq("owner_id", ownerId)
        .single();

      if (queryError) throw queryError;

      const row = readCloudTrip(data);
      const snapshot = readSnapshot(data.data, id);

      restoreSnapshot(snapshot, row.revision);
      setLocalTrips(readLocalTrips());
      updateCloudList(row);
      setConfirmRestore(null);
      setNotice(`${snapshot.trip.name} is ready in this browser.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          Your journeys, wherever you are
        </p>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Cloud saves
        </h1>

        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          Save a complete trip to your account, then restore it
          on another browser to keep planning.
        </p>

        <div className="mt-6 rounded-3xl bg-sky p-6">
          <p className="font-semibold">You choose when to sync.</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Save after making changes. Restore before continuing on
            another device. Restoring replaces that trip’s local
            details with the cloud version.
          </p>
        </div>

        <p role="status" className="mt-5 text-sm text-muted">
          {notice || (!ready && !error ? "Loading your saves…" : "")}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-terracotta/30 bg-white p-4 text-sm text-terracotta"
          >
            {error}
          </p>
        )}

        {ready && (
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-2">
            <section aria-labelledby="local-heading">
              <h2 id="local-heading" className="text-2xl font-semibold">
                In this browser
              </h2>

              <p className="mt-2 text-sm text-muted">
                Includes the itinerary, wishlist, bookings, budget and pins.
              </p>

              <div className="mt-5 space-y-4">
                {localTrips.length === 0 ? (
                  <Card>
                    <CardContent>
                      <p className="text-muted">No local trips yet.</p>
                      <ButtonLink href="/trips" className="mt-5">
                        Create a trip
                      </ButtonLink>
                    </CardContent>
                  </Card>
                ) : (
                  localTrips.map((trip) => (
                    <Card key={trip.id}>
                      <CardContent>
                        <h3 className="break-words text-xl font-semibold">
                          {trip.name}
                        </h3>
                        <p className="mt-2 text-sm text-muted">
                          {trip.cities.join(" → ")}
                        </p>
                        <Button
                          className="mt-5"
                          disabled={Boolean(busy)}
                          onClick={() => saveToCloud(trip.id)}
                        >
                          {busy === `save:${trip.id}`
                            ? "Saving…"
                            : "Save to cloud"}
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </section>

            <section aria-labelledby="cloud-heading">
              <h2 id="cloud-heading" className="text-2xl font-semibold">
                Saved to your account
              </h2>

              <p className="mt-2 text-sm text-muted">
                Only trips owned by your account appear here.
              </p>

              <div className="mt-5 space-y-4">
                {cloudTrips.length === 0 ? (
                  <Card>
                    <CardContent>
                      <p className="text-muted">
                        Save your first trip to see it here.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  cloudTrips.map((trip) => {
                    const hasLocalCopy = localTrips.some(
                      (item) => item.id === trip.id,
                    );

                    return (
                      <Card key={trip.id}>
                        <CardContent>
                          <h3 className="break-words text-xl font-semibold">
                            {trip.name}
                          </h3>

                          <p className="mt-2 text-sm text-muted">
                            Saved {dateLabel(trip.updated_at)}
                          </p>

                          <p className="mt-1 text-xs text-muted">
                            Version {trip.revision}
                          </p>

                          {confirmRestore === trip.id ? (
                            <div className="mt-5 rounded-2xl bg-background p-4">
                              <p className="text-sm leading-relaxed">
                                Replace this trip’s browser copy with its
                                cloud version? Local changes made since
                                the last cloud save will be replaced.
                              </p>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                  disabled={Boolean(busy)}
                                  onClick={() => restoreFromCloud(trip.id)}
                                >
                                  {busy === `restore:${trip.id}`
                                    ? "Restoring…"
                                    : "Replace local copy"}
                                </Button>

                                <Button
                                  variant="ghost"
                                  disabled={Boolean(busy)}
                                  onClick={() => setConfirmRestore(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="secondary"
                              className="mt-5"
                              disabled={Boolean(busy)}
                              onClick={() => {
                                if (hasLocalCopy) {
                                  setConfirmRestore(trip.id);
                                } else {
                                  void restoreFromCloud(trip.id);
                                }
                              }}
                            >
                              {busy === `restore:${trip.id}`
                                ? "Restoring…"
                                : "Restore to this browser"}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/trips" variant="secondary">
            Open my trips
          </ButtonLink>

          <Button
            variant="ghost"
            disabled={Boolean(busy)}
            onClick={() => window.location.reload()}
          >
            Refresh cloud list
          </Button>
        </div>
      </main>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Trip = {
  id: string;
  name: string;
};

type Share = {
  token: string;
  trip_id: string;
  enabled: boolean;
};

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message;

  if (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return "Something went wrong. Please try again.";
}

export default function SharingPage() {
  const [supabase] = useState(() => createClient());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [userId, setUserId] = useState("");
  const [origin, setOrigin] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setOrigin(window.location.origin);

    async function load() {
      try {
        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError || !auth.user) {
          throw new Error("Please log in again.");
        }

        const [tripResult, shareResult] = await Promise.all([
          supabase
            .from("roam_trips")
            .select("id, name")
            .eq("owner_id", auth.user.id)
            .order("updated_at", { ascending: false }),

          supabase
            .from("roam_shares")
            .select("token, trip_id, enabled")
            .eq("owner_id", auth.user.id),
        ]);

        if (tripResult.error) throw tripResult.error;
        if (shareResult.error) throw shareResult.error;
        if (!active) return;

        setTrips(tripResult.data ?? []);
        setShares(shareResult.data ?? []);
        setUserId(auth.user.id);
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

  async function setSharing(trip: Trip, enabled: boolean) {
    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { data: auth, error: authError } =
          await supabase.auth.getUser();

      if (authError || auth.user?.id !== userId) {
        throw new Error("Your account changed. Reload before continuing.");
      }

      const existing = shares.find((share) => share.trip_id === trip.id);
      let saved: Share;

      if (existing) {
        const { data, error: updateError } = await supabase
          .from("roam_shares")
          .update({ enabled })
          .eq("trip_id", trip.id)
          .eq("owner_id", userId)
          .select("token, trip_id, enabled")
          .single();

        if (updateError) throw updateError;
        saved = data;
      } else {
        const { data, error: insertError } = await supabase
          .from("roam_shares")
          .insert({
            trip_id: trip.id,
            owner_id: userId,
            enabled,
          })
          .select("token, trip_id, enabled")
          .single();

        if (insertError) {
          if (insertError.code === "23505") {
            throw new Error(
              "Sharing was changed in another tab. Refresh this page to see it.",
            );
          }
          throw insertError;
        }

        saved = data;
      }

      setShares((current) => [
        saved,
        ...current.filter((share) => share.trip_id !== trip.id),
      ]);

      setNotice(
        enabled
          ? `Sharing is on for ${trip.name}.`
          : `Sharing is off for ${trip.name}. Refreshing its public link will no longer show the itinerary.`,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setError("");
      setNotice("Link copied.");
    } catch {
      setError("The link couldn’t be copied automatically. Select and copy it from the field.");
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          Let them in on the adventure
        </p>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Share the journey.
        </h1>

        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          Create a read-only link to your itinerary. Friends can
          see your destinations and activities without signing in.
        </p>

        <div className="mt-7 rounded-3xl bg-sky p-6">
          <p className="font-semibold">Share the plans you choose to save.</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Links show the latest cloud save. Save your trip before
            sharing updates. Budgets, bookings, wishlist items,
            map pins and personal notes aren’t included.
          </p>

          <ButtonLink
            href="/trips/cloud"
            variant="secondary"
            className="mt-4"
          >
            Open cloud saves
          </ButtonLink>
        </div>

        <p role="status" className="mt-5 text-sm text-muted">
          {notice || (!ready && !error ? "Loading sharing settings…" : "")}
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-terracotta">
            {error}
          </p>
        )}

        {ready && trips.length === 0 && (
          <Card className="mt-8">
            <CardContent>
              <h2 className="text-xl font-semibold">Save a trip first.</h2>
              <p className="mt-3 text-sm text-muted">
                Your cloud-saved trips will appear here.
              </p>
              <ButtonLink href="/trips/cloud" className="mt-5">
                Save a trip
              </ButtonLink>
            </CardContent>
          </Card>
        )}

        <div className="mt-8 space-y-5">
          {trips.map((trip) => {
            const share = shares.find((item) => item.trip_id === trip.id);
            const url = share ? `${origin}/share/${share.token}` : "";

            return (
              <Card key={trip.id}>
                <CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="break-words text-2xl font-semibold">
                      {trip.name}
                    </h2>

                    <span
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                        share?.enabled ? "bg-[#e4e9d9]" : "bg-background"
                      }`}
                    >
                      {share?.enabled ? "Sharing on" : "Sharing off"}
                    </span>
                  </div>

                  {share?.enabled ? (
                    <>
                      <label
                        htmlFor={`link-${trip.id}`}
                        className="mt-5 block text-sm font-semibold"
                      >
                        Share link
                      </label>

                      <input
                        id={`link-${trip.id}`}
                        value={url}
                        readOnly
                        onFocus={(event) => event.target.select()}
                        className="mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 text-sm"
                      />

                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          disabled={busy}
                          onClick={() => copyLink(url)}
                        >
                          Copy link
                        </Button>

                        <ButtonLink
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="secondary"
                        >
                          Preview ↗
                        </ButtonLink>

                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setSharing(trip, false)}
                        >
                          Turn sharing off
                        </Button>
                      </div>

                      <p className="mt-4 text-xs leading-relaxed text-muted">
                        Anyone with this link can view the shared itinerary.
                        Turning it off won’t remove copies someone already saved.
                      </p>
                    </>
                  ) : (
                    <>
                      <Button
                        className="mt-5"
                        disabled={busy}
                        onClick={() => setSharing(trip, true)}
                      >
                        {busy
                          ? "Updating…"
                          : share
                            ? "Turn sharing back on"
                            : "Create share link"}
                      </Button>

                      {share && (
                        <p className="mt-3 text-xs text-muted">
                          Turning sharing back on reactivates the previous link.
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
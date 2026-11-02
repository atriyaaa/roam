"use client";

import { Button } from "@/components/ui/button";

export default function SharedItineraryError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-xl px-6 py-20 text-center">
      <h1 className="text-3xl font-semibold">
        We couldn’t unfold this itinerary.
      </h1>

      <p className="mt-4 leading-relaxed text-muted">
        There may be a connection problem. Please try again shortly.
      </p>

      <Button onClick={reset} className="mt-6">
        Try again
      </Button>
    </main>
  );
}
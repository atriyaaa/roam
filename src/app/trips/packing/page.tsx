"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { accountStorage } from "@/lib/account-storage";
import { SiteHeader } from "@/components/site-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PackingItem = {
  id: string;
  title: string;
  category: string;
  packed: boolean;
};

type Trip = Record<string, unknown> & {
  id: string;
  name: string;
  packingList?: PackingItem[];
};

const TRIPS_KEY = "roam.trips.v1";

const categories = [
  "Documents",
  "Clothing",
  "Toiletries",
  "Electronics",
  "Other",
];

const essentials = [
  { title: "ID or passport, as needed", category: "Documents" },
  { title: "Booking details", category: "Documents" },
  { title: "Phone charger", category: "Electronics" },
  { title: "Plug adapter, as needed", category: "Electronics" },
  { title: "Comfortable walking shoes", category: "Clothing" },
  { title: "Spare outfit", category: "Clothing" },
  { title: "Toothbrush and toothpaste", category: "Toiletries" },
  { title: "Reusable water bottle", category: "Other" },
];

const inputStyles =
  "mt-2 w-full rounded-2xl border border-foreground/20 bg-background px-4 py-3 outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/20";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPackingList(value: unknown): PackingItem[] {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    throw new Error("This packing list couldn’t be read.");
  }

  const items = value.map((item): PackingItem => {
    if (
      !isObject(item) ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.category !== "string" ||
      typeof item.packed !== "boolean"
    ) {
      throw new Error("A packing item couldn’t be read.");
    }

    return {
      id: item.id,
      title: item.title,
      category: item.category,
      packed: item.packed,
    };
  });

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new Error("The packing list contains duplicate item IDs.");
  }

  return items;
}

function readTrips(): Trip[] {
  const value: unknown = JSON.parse(
    accountStorage.getItem(TRIPS_KEY) ?? "[]",
  );

  if (!Array.isArray(value)) {
    throw new Error("Your trips couldn’t be read.");
  }

  return value.map((trip): Trip => {
    if (
      !isObject(trip) ||
      typeof trip.id !== "string" ||
      typeof trip.name !== "string"
    ) {
      throw new Error("A trip couldn’t be read.");
    }

    return {
      ...trip,
      id: trip.id,
      name: trip.name,
      packingList: readPackingList(trip.packingList),
    };
  });
}

export default function PackingPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripId, setTripId] = useState("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Other");
  const [filter, setFilter] = useState<"All" | "To pack" | "Packed">("All");

  useEffect(() => {
    try {
      const loaded = readTrips();
      setTrips(loaded);
      setTripId(loaded[0]?.id ?? "");
      setReady(true);
    } catch (caught) {
      setLoadError(
        caught instanceof Error
          ? caught.message
          : "Your packing lists couldn’t be loaded.",
      );
    }
  }, []);

  const trip = trips.find((item) => item.id === tripId);
  const items = trip?.packingList ?? [];
  const packedCount = items.filter((item) => item.packed).length;

  const progress =
    items.length === 0
      ? 0
      : Math.round((packedCount / items.length) * 100);

  const visibleItems = items.filter((item) => {
    if (filter === "Packed") return item.packed;
    if (filter === "To pack") return !item.packed;
    return true;
  });

  const visibleCategories = [
    ...new Set(visibleItems.map((item) => item.category)),
  ];

  function updateList(
    change: (current: PackingItem[]) => PackingItem[],
    message: string,
  ) {
    try {
      // Re-read the latest trip data so changes elsewhere are preserved.
      const latest = readTrips();
      const currentTrip = latest.find((item) => item.id === tripId);

      if (!currentTrip) {
        throw new Error("This trip no longer exists. Reload the page.");
      }

      const nextItems = change(currentTrip.packingList ?? []);

      if (nextItems.length > 500) {
        throw new Error("This checklist supports up to 500 items.");
      }

      const updated = latest.map((item) =>
        item.id === tripId
          ? { ...item, packingList: nextItems }
          : item,
      );

      accountStorage.setItem(TRIPS_KEY, JSON.stringify(updated));
      setTrips(updated);
      setError("");
      setNotice(message);

      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your packing list couldn’t be saved.",
      );

      return false;
    }
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = title.trim();

    if (!name) {
      setError("Add an item name.");
      return;
    }

    const saved = updateList((current) => {
      if (
        current.some(
          (item) => item.title.trim().toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new Error("That item is already on your list.");
      }

      return [
        ...current,
        {
          id: crypto.randomUUID(),
          title: name,
          category,
          packed: false,
        },
      ];
    }, `${name} added.`);

    if (saved) {
      setTitle("");
      setFilter("All");
    }
  }

  function addEssentials() {
    updateList((current) => {
      const existingTitles = new Set(
        current.map((item) => item.title.trim().toLowerCase()),
      );

      const additions = essentials
        .filter((item) => !existingTitles.has(item.title.toLowerCase()))
        .map((item) => ({
          ...item,
          id: crypto.randomUUID(),
          packed: false,
        }));

      return [...current, ...additions];
    }, "Essentials checked and added. Existing items were kept.");

    setFilter("All");
  }

  function toggleItem(item: PackingItem) {
    updateList(
      (current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, packed: !entry.packed }
            : entry,
        ),
      `${item.title} updated.`,
    );
  }

  function removeItem(item: PackingItem) {
    updateList(
      (current) => current.filter((entry) => entry.id !== item.id),
      `${item.title} removed.`,
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-6 py-12 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
          Less forgetting. More going.
        </p>

        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Pack a little peace of mind.
        </h1>

        <p className="mt-4 max-w-xl leading-relaxed text-muted">
          The essentials, the little extras and the charger you
          nearly left behind. Keep them all in one place.
        </p>

        {!ready && !loadError && (
          <p role="status" className="mt-8">
            Opening your packing lists…
          </p>
        )}

        {loadError && (
          <p role="alert" className="mt-8 text-terracotta">
            {loadError}
          </p>
        )}

        {ready && !trip && (
          <ButtonLink href="/trips" className="mt-8">
            Create a trip first
          </ButtonLink>
        )}

        {ready && trip && (
          <>
            <div className="mt-8 max-w-md">
              <label htmlFor="packing-trip" className="text-sm font-semibold">
                Choose your trip
              </label>

              <select
                id="packing-trip"
                value={tripId}
                onChange={(event) => {
                  setTripId(event.target.value);
                  setTitle("");
                  setCategory("Other");
                  setFilter("All");
                  setError("");
                  setNotice("");
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

            <section
              aria-label="Packing progress"
              className="mt-8 rounded-3xl bg-sky p-6 sm:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">
                    {items.length > 0 && packedCount === items.length
                      ? "All packed. Adventure awaits."
                      : "A little closer to ready."}
                  </h2>

                  <p className="mt-2 text-sm text-muted">
                    {packedCount} of {items.length} items packed
                  </p>
                </div>

                <p className="text-3xl font-semibold">{progress}%</p>
              </div>

              <progress
                aria-label="Packing progress"
                max={items.length || 1}
                value={packedCount}
                className="mt-5 h-3 w-full overflow-hidden rounded-full accent-terracotta"
              />
            </section>

            <Card className="mt-6">
              <CardContent className="sm:p-8">
                <h2 className="text-xl font-semibold">
                  What’s going in the bag?
                </h2>

                <form
                  onSubmit={addItem}
                  className="mt-5 grid items-end gap-4 sm:grid-cols-[1fr_180px_auto]"
                >
                  <div>
                    <label htmlFor="packing-title" className="text-sm font-semibold">
                      Item
                    </label>

                    <input
                      id="packing-title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Phone charger"
                      maxLength={120}
                      required
                      className={inputStyles}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="packing-category"
                      className="text-sm font-semibold"
                    >
                      Category
                    </label>

                    <select
                      id="packing-category"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className={inputStyles}
                    >
                      {categories.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button type="submit">Add item</Button>
                </form>

                <div className="mt-6 border-t border-foreground/10 pt-5">
                  <Button variant="secondary" onClick={addEssentials}>
                    Add an essentials template
                  </Button>

                  <p className="mt-3 text-xs leading-relaxed text-muted">
                    A starting point you can customise—not a complete
                    checklist for every destination.
                  </p>
                </div>
              </CardContent>
            </Card>

            <p role="status" className="mt-4 text-sm text-muted">
              {notice}
            </p>

            {error && (
              <p role="alert" className="mt-4 text-sm text-terracotta">
                {error}
              </p>
            )}

            <div
              aria-label="Filter packing items"
              className="mt-7 flex flex-wrap gap-2"
            >
              {(["All", "To pack", "Packed"] as const).map((option) => (
                <Button
                  key={option}
                  variant={filter === option ? "primary" : "secondary"}
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                >
                  {option}
                </Button>
              ))}
            </div>

            {visibleItems.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-foreground/20 p-10 text-center">
                <h2 className="text-xl font-semibold">
                  {items.length === 0
                    ? "Start with the essentials."
                    : "Nothing in this view."}
                </h2>

                <p className="mt-3 text-sm text-muted">
                  {items.length === 0
                    ? "Add your own items or use the template above."
                    : "Try another filter to see the rest of your list."}
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                {visibleCategories.map((group) => (
                  <Card key={group}>
                    <CardContent>
                      <h2 className="text-lg font-semibold">{group}</h2>

                      <ul className="mt-4 divide-y divide-foreground/10">
                        {visibleItems
                          .filter((item) => item.category === group)
                          .map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center justify-between gap-4 py-3"
                            >
                              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1">
                                <input
                                  type="checkbox"
                                  checked={item.packed}
                                  onChange={() => toggleItem(item)}
                                  className="h-5 w-5 shrink-0 accent-terracotta"
                                />

                                <span
                                  className={`break-words text-sm ${
                                    item.packed
                                      ? "text-muted line-through"
                                      : "font-medium"
                                  }`}
                                >
                                  {item.title}
                                </span>
                              </label>

                              <Button
                                variant="ghost"
                                className="shrink-0 px-3"
                                aria-label={`Remove ${item.title}`}
                                onClick={() => removeItem(item)}
                              >
                                ×
                              </Button>
                            </li>
                          ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-lg text-sm leading-relaxed text-muted">
                Your checklist is stored with this trip. Save to
                cloud after changes to bring it to another browser.
              </p>

              <ButtonLink href="/trips/cloud" variant="secondary">
                Open cloud saves ↗
              </ButtonLink>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
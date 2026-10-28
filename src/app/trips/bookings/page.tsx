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
  currency: string;
};

type BookingStatus = "To book" | "Booked" | "Cancelled";

type Booking = {
  id: string;
  tripId: string;
  title: string;
  category: string;
  status: BookingStatus;
  date: string;
  reference: string;
  url: string;
  notes: string;
};

type BookingForm = Omit<Booking, "id" | "tripId">;

const TRIPS_KEY = "roam.trips.v1";
const BOOKINGS_KEY = "roam.bookings.v1";

const categories = [
  "Accommodation",
  "Transport",
  "Restaurant",
  "Experience",
  "Other",
];

const statuses: BookingStatus[] = ["To book", "Booked", "Cancelled"];

const emptyForm: BookingForm = {
  title: "",
  category: "Accommodation",
  status: "To book",
  date: "",
  reference: "",
  url: "",
  notes: "",
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

function safeUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function readTrips(value: unknown): Trip[] {
  if (!Array.isArray(value)) throw new Error("Invalid trips");

  return value.map((trip) => {
    if (
      !isRecord(trip) ||
      typeof trip.id !== "string" ||
      typeof trip.name !== "string"
    ) {
      throw new Error("Invalid trip");
    }

    return {
      id: trip.id,
      name: trip.name,
      currency: typeof trip.currency === "string" ? trip.currency : "GBP",
    };
  });
}

function readBookings(value: unknown): Booking[] {
  if (!Array.isArray(value)) throw new Error("Invalid bookings");

  return value.map((booking) => {
    if (
      !isRecord(booking) ||
      typeof booking.id !== "string" ||
      typeof booking.tripId !== "string" ||
      typeof booking.title !== "string" ||
      typeof booking.category !== "string" ||
      !statuses.includes(booking.status as BookingStatus) ||
      typeof booking.date !== "string" ||
      typeof booking.reference !== "string" ||
      typeof booking.url !== "string" ||
      typeof booking.notes !== "string"
    ) {
      throw new Error("Invalid booking");
    }

    return {
      id: booking.id,
      tripId: booking.tripId,
      title: booking.title,
      category: booking.category,
      status: booking.status as BookingStatus,
      date: booking.date,
      reference: booking.reference,
      url: booking.url,
      notes: booking.notes,
    };
  });
}

function dateLabel(value: string) {
  if (!value) return "Date to be decided";

  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Date to be decided";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function BookingsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tripId, setTripId] = useState("");
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BookingForm>({ ...emptyForm });
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    try {
      const loadedTrips = readTrips(
        JSON.parse(localStorage.getItem(TRIPS_KEY) ?? "[]"),
      );

      const loadedBookings = readBookings(
        JSON.parse(localStorage.getItem(BOOKINGS_KEY) ?? "[]"),
      );

      setTrips(loadedTrips);
      setBookings(loadedBookings);
      setTripId(loadedTrips[0]?.id ?? "");
    } catch {
      setLoadError(
        "Your saved trips or bookings couldn’t be loaded. Reload before making changes.",
      );
    } finally {
      setReady(true);
    }
  }, []);

  const trip = trips.find((item) => item.id === tripId);
  const tripBookings = bookings.filter((booking) => booking.tripId === tripId);
  const activeBookings = tripBookings.filter(
    (booking) => booking.status !== "Cancelled",
  );
  const confirmedCount = activeBookings.filter(
    (booking) => booking.status === "Booked",
  ).length;
  const pendingCount = activeBookings.length - confirmedCount;

  const visibleBookings = tripBookings
    .filter((booking) => filter === "All" || booking.status === filter)
    .sort((a, b) => {
      if (!a.date && !b.date) return a.title.localeCompare(b.title);
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });

  function updateForm<K extends keyof BookingForm>(
    field: K,
    value: BookingForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
    setError("");
  }

  function startBooking() {
    closeForm();
    setNotice("");
    setShowForm(true);
  }

  function persistBookings(updated: Booking[]) {
    try {
      localStorage.setItem(BOOKINGS_KEY, JSON.stringify(updated));
      setBookings(updated);
      setError("");
      return true;
    } catch {
      setError(
        "Your bookings couldn’t be saved. Check browser storage and try again.",
      );
      return false;
    }
  }

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      setError("Give this booking a name.");
      return;
    }

    const enteredUrl = form.url.trim();
    const url = enteredUrl ? safeUrl(enteredUrl) : "";

    if (enteredUrl && !url) {
      setError("Use a complete confirmation link starting with https:// or http://.");
      return;
    }

    const booking: Booking = {
      id: editingId ?? crypto.randomUUID(),
      tripId,
      title: form.title.trim(),
      category: form.category,
      status: form.status,
      date: form.date,
      reference: form.reference.trim(),
      url,
      notes: form.notes.trim(),
    };

    const updated = editingId
      ? bookings.map((item) => item.id === editingId ? booking : item)
      : [booking, ...bookings];

    if (persistBookings(updated)) {
      const wasEditing = Boolean(editingId);
      closeForm();
      setFilter("All");
      setNotice(wasEditing ? "Booking updated." : "Booking added.");
    }
  }

  function editBooking(booking: Booking) {
    setEditingId(booking.id);
    setForm({
      title: booking.title,
      category: booking.category,
      status: booking.status,
      date: booking.date,
      reference: booking.reference,
      url: booking.url,
      notes: booking.notes,
    });
    setError("");
    setNotice("");
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changeStatus(booking: Booking, status: BookingStatus) {
    if (
      persistBookings(
        bookings.map((item) =>
          item.id === booking.id ? { ...item, status } : item,
        ),
      )
    ) {
      // Keep an open edit form in sync with the status selector.
      if (editingId === booking.id) updateForm("status", status);
      setNotice(`${booking.title} marked as ${status.toLowerCase()}.`);
    }
  }

  function removeBooking(booking: Booking) {
    if (persistBookings(bookings.filter((item) => item.id !== booking.id))) {
      if (editingId === booking.id) closeForm();
      setNotice(`${booking.title} removed from your checklist.`);
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-terracotta">
              The details that make it happen
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Your booking checklist
            </h1>
            <p className="mt-4 max-w-xl leading-relaxed text-muted">
              Somewhere to stay. A train to catch. That table by the
              window. Keep the important details together.
            </p>
          </div>

          <Button
            onClick={startBooking}
            disabled={!ready || Boolean(loadError) || !trip}
            aria-expanded={showForm}
            aria-controls="booking-form"
          >
            ＋ Add booking
          </Button>
        </div>

        {!ready && <p role="status" className="mt-8">Loading bookings…</p>}

        {loadError && (
          <p role="alert" className="mt-8 text-terracotta">{loadError}</p>
        )}

        {ready && !loadError && !trip && (
          <Card className="mt-8">
            <CardContent>
              <h2 className="text-2xl font-semibold">Start with your journey.</h2>
              <p className="mt-3 mb-6 text-muted">
                Create a trip before adding its bookings.
              </p>
              <ButtonLink href="/trips">Go to my trips</ButtonLink>
            </CardContent>
          </Card>
        )}

        {ready && !loadError && trip && (
          <>
            <div className="mt-8 max-w-md">
              <Field id="booking-trip" label="Choose your trip">
                <select
                  id="booking-trip"
                  value={tripId}
                  onChange={(event) => {
                    setTripId(event.target.value);
                    closeForm();
                    setFilter("All");
                    setNotice("");
                  }}
                  className={inputStyles}
                >
                  {trips.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { label: "On the checklist", count: activeBookings.length, colour: "bg-sky" },
                { label: "Booked", count: confirmedCount, colour: "bg-[#e4e9d9]" },
                { label: "Still to book", count: pendingCount, colour: "bg-[#f0dfce]" },
              ].map((item) => (
                <div key={item.label} className={`rounded-3xl p-6 ${item.colour}`}>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="mt-3 text-4xl font-semibold">{item.count}</p>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs text-muted">
              Cancelled items are excluded from these totals.
            </p>

            <p role="status" className="mt-4 text-sm text-muted">{notice}</p>
            {error && <p role="alert" className="mt-4 text-terracotta">{error}</p>}

            {showForm && (
              <Card className="mt-6">
                <CardContent className="sm:p-8">
                  <h2 className="text-2xl font-semibold">
                    {editingId ? "Update the details" : "One more piece of the journey"}
                  </h2>

                  <form
                    id="booking-form"
                    onSubmit={submitBooking}
                    className="mt-6 max-w-2xl space-y-5"
                  >
                    <Field id="booking-title" label="Booking name">
                      <input
                        id="booking-title"
                        value={form.title}
                        onChange={(event) => updateForm("title", event.target.value)}
                        placeholder="Three nights in Lisbon"
                        maxLength={150}
                        required
                        className={inputStyles}
                      />
                    </Field>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field id="booking-category" label="Category">
                        <select
                          id="booking-category"
                          value={form.category}
                          onChange={(event) => updateForm("category", event.target.value)}
                          className={inputStyles}
                        >
                          {categories.map((category) => (
                            <option key={category} value={category}>{category}</option>
                          ))}
                        </select>
                      </Field>

                      <Field id="booking-status" label="Status">
                        <select
                          id="booking-status"
                          value={form.status}
                          onChange={(event) =>
                            updateForm("status", event.target.value as BookingStatus)
                          }
                          className={inputStyles}
                        >
                          {statuses.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <Field id="booking-date" label="Booking or check-in date — optional">
                      <input
                        id="booking-date"
                        type="date"
                        value={form.date}
                        onChange={(event) => updateForm("date", event.target.value)}
                        className={inputStyles}
                      />
                    </Field>

                    <Field id="booking-reference" label="Confirmation reference — optional">
                      <input
                        id="booking-reference"
                        value={form.reference}
                        onChange={(event) => updateForm("reference", event.target.value)}
                        placeholder="Your booking reference"
                        maxLength={100}
                        className={inputStyles}
                      />
                    </Field>

                    <Field id="booking-url" label="Confirmation link — optional">
                      <input
                        id="booking-url"
                        type="url"
                        value={form.url}
                        onChange={(event) => updateForm("url", event.target.value)}
                        placeholder="https://..."
                        maxLength={2000}
                        className={inputStyles}
                      />
                    </Field>

                    <Field id="booking-notes" label="Notes — optional">
                      <textarea
                        id="booking-notes"
                        rows={3}
                        value={form.notes}
                        onChange={(event) => updateForm("notes", event.target.value)}
                        placeholder="Address, arrival instructions or cancellation deadline…"
                        maxLength={3000}
                        className={inputStyles}
                      />
                    </Field>

                    <div className="flex gap-3">
                      <Button type="submit">
                        {editingId ? "Save changes" : "Save booking"}
                      </Button>
                      <Button variant="ghost" onClick={closeForm}>Cancel</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            <div className="mt-8 flex flex-wrap gap-2" aria-label="Filter bookings">
              {["All", ...statuses].map((status) => (
                <Button
                  key={status}
                  variant={filter === status ? "primary" : "secondary"}
                  aria-pressed={filter === status}
                  onClick={() => setFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>

            <section aria-label="Bookings" className="mt-6">
              {visibleBookings.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-foreground/20 px-6 py-14 text-center">
                  <h2 className="text-2xl font-semibold">
                    {tripBookings.length === 0
                      ? "Let’s make this trip a little more real."
                      : "Nothing here just yet."}
                  </h2>
                  <p className="mt-3 text-muted">
                    {tripBookings.length === 0
                      ? "Add a stay, a journey or a reservation to start your checklist."
                      : "Try another status filter to see your other bookings."}
                  </p>
                  {tripBookings.length === 0 && (
                    <Button className="mt-6" onClick={startBooking}>
                      Add my first booking
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {visibleBookings.map((booking) => {
                    const confirmationUrl = safeUrl(booking.url);

                    return (
                      <Card key={booking.id} className="flex flex-col">
                        <CardContent className="flex flex-1 flex-col">
                          <p className="text-xs font-bold uppercase tracking-widest text-terracotta">
                            {booking.category}
                          </p>
                          <h2 className="mt-3 break-words text-2xl font-semibold">
                            {booking.title}
                          </h2>
                          <p className="mt-2 text-sm text-muted">
                            {dateLabel(booking.date)}
                          </p>

                          <div className="mt-5">
                            <label
                              htmlFor={`status-${booking.id}`}
                              className="text-sm font-semibold"
                            >
                              Status
                            </label>
                            <select
                              id={`status-${booking.id}`}
                              value={booking.status}
                              onChange={(event) =>
                                changeStatus(booking, event.target.value as BookingStatus)
                              }
                              className={inputStyles}
                            >
                              {statuses.map((status) => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </div>

                          {booking.reference && (
                            <div className="mt-5 rounded-2xl bg-background p-4">
                              <p className="text-xs text-muted">Confirmation reference</p>
                              <p className="mt-1 break-all font-mono text-sm font-semibold">
                                {booking.reference}
                              </p>
                            </div>
                          )}

                          {booking.notes && (
                            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                              {booking.notes}
                            </p>
                          )}

                          {confirmationUrl && (
                            <a
                              href={confirmationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-5 inline-flex self-start text-sm font-semibold text-terracotta underline underline-offset-4"
                            >
                              Open confirmation ↗
                            </a>
                          )}

                          <div className="mt-auto flex gap-2 pt-6">
                            <Button variant="secondary" onClick={() => editBooking(booking)}>
                              Edit
                            </Button>
                            <Button variant="ghost" onClick={() => removeBooking(booking)}>
                              Remove
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            <p className="mt-8 text-sm text-muted">
              This checklist records your plans. Changing a status here
              doesn’t make or cancel a reservation with the provider.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
import { NextResponse } from "next/server";

type Place = {
  id: string;
  label: string;
  longitude: number;
  latitude: number;
};

const cache = new Map<string, { places: Place[]; expires: number }>();
let nextRequestAt = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (query.length < 3 || query.length > 200) {
    return NextResponse.json(
      { error: "Search using between 3 and 200 characters." },
      { status: 400 },
    );
  }

  const key = query.toLowerCase();
  const cached = cache.get(key);

  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({ places: cached.places });
  }

  if (Date.now() < nextRequestAt) {
    return NextResponse.json(
      { error: "Wait a moment before searching again." },
      { status: 429 },
    );
  }

  nextRequestAt = Date.now() + 1100;

  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", query);
    url.searchParams.set("limit", "5");
    url.searchParams.set("lang", "en");

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!response.ok) throw new Error("Search unavailable");

    const data: unknown = await response.json();

    if (!isRecord(data) || !Array.isArray(data.features)) {
      throw new Error("Invalid results");
    }

    const places: Place[] = [];

    data.features.forEach((feature, index) => {
      if (
        !isRecord(feature) ||
        !isRecord(feature.geometry) ||
        !Array.isArray(feature.geometry.coordinates) ||
        !isRecord(feature.properties)
      ) {
        return;
      }

      const [longitude, latitude] = feature.geometry.coordinates;

      if (
        typeof longitude !== "number" ||
        typeof latitude !== "number" ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        Math.abs(longitude) > 180 ||
        Math.abs(latitude) > 90
      ) {
        return;
      }

      const properties = feature.properties;

      const parts = [
        properties.name,
        properties.street,
        properties.city,
        properties.state,
        properties.country,
      ].filter((part): part is string => typeof part === "string" && part.length > 0);

      const label = [...new Set(parts)].join(", ");
      if (!label) return;

      places.push({
        id: `${longitude}-${latitude}-${index}`,
        label,
        longitude,
        latitude,
      });
    });

    // Bound the in-memory cache during local development.
    if (cache.size >= 100) cache.clear();

    cache.set(key, {
      places,
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    return NextResponse.json({ places });
  } catch {
    return NextResponse.json(
      { error: "Place search is unavailable right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
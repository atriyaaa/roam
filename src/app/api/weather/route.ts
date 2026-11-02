import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

const cache = new Map<
  string,
  { forecast: Forecast; expires: number }
>();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numericValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      return json(
        { error: "Please log in to view the forecast." },
        401,
      );
    }
  } catch {
    return json(
      { error: "Your account couldn’t be checked. Please try again." },
      503,
    );
  }

  const params = new URL(request.url).searchParams;
  const latitudeInput = params.get("latitude");
  const longitudeInput = params.get("longitude");

  if (!latitudeInput?.trim() || !longitudeInput?.trim()) {
    return json(
      { error: "Choose a saved city location first." },
      400,
    );
  }

  const latitude = Number(latitudeInput);
  const longitude = Number(longitudeInput);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return json(
      { error: "This location has invalid coordinates." },
      400,
    );
  }

  const roundedLatitude = latitude.toFixed(4);
  const roundedLongitude = longitude.toFixed(4);
  const cacheKey = `${roundedLatitude},${roundedLongitude}`;
  const cached = cache.get(cacheKey);

  if (cached && cached.expires > Date.now()) {
    return json(cached.forecast);
  }

  try {
    const apiKey = process.env.OPEN_METEO_API_KEY;

    const url = new URL(
      apiKey
        ? "https://customer-api.open-meteo.com/v1/forecast"
        : "https://api.open-meteo.com/v1/forecast",
    );

    url.searchParams.set("latitude", roundedLatitude);
    url.searchParams.set("longitude", roundedLongitude);
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "7");
    url.searchParams.set("temperature_unit", "celsius");

    url.searchParams.set(
      "daily",
      [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
      ].join(","),
    );

    if (apiKey) {
      url.searchParams.set("apikey", apiKey);
    }

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error("Weather service unavailable");
    }

    const data: unknown = await response.json();

    if (!isObject(data) || !isObject(data.daily)) {
      throw new Error("Invalid forecast");
    }

    const daily = data.daily;
    const dates = daily.time;

    if (!Array.isArray(dates)) {
      throw new Error("Invalid forecast dates");
    }

    function dailyValue(field: string, index: number) {
      const values = daily[field];

      return Array.isArray(values)
        ? numericValue(values[index])
        : null;
    }

    const days: ForecastDay[] = dates.map(
      (date: unknown, index: number): ForecastDay => {
        if (
          typeof date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date)
        ) {
          throw new Error("Invalid forecast date");
        }

        return {
          date,
          code: dailyValue("weather_code", index),
          high: dailyValue("temperature_2m_max", index),
          low: dailyValue("temperature_2m_min", index),
          precipitation: dailyValue(
            "precipitation_probability_max",
            index,
          ),
        };
      },
    );

    if (days.length === 0) {
      throw new Error("Empty forecast");
    }

    const forecast: Forecast = {
      timezone:
        typeof data.timezone === "string"
          ? data.timezone
          : "Local time",
      days,
    };

    if (cache.size >= 200) {
      cache.clear();
    }

    cache.set(cacheKey, {
      forecast,
      expires: Date.now() + 15 * 60 * 1000,
    });

    return json(forecast);
  } catch {
    return json(
      {
        error:
          "The forecast couldn’t be loaded. Please try again shortly.",
      },
      503,
    );
  }
}
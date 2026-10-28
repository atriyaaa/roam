"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  LngLatBounds,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";

export type MapPin = {
  id: string;
  title: string;
  label: string;
  longitude: number;
  latitude: number;
  kind: "city" | "activity";
};

type TripMapProps = {
  pins: MapPin[];
};

export function TripMap({ pins }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;

    let map: MapLibreMap | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;

    setWorkerUrl(
      new URL(
        "maplibre-gl/dist/maplibre-gl-worker.mjs",
        import.meta.url,
      ).toString(),
    );

    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/liberty",
        center: [0, 25],
        zoom: 1.5,
        attributionControl: { compact: true },
      });

      mapRef.current = map;
      map.addControl(new NavigationControl(), "top-right");

      map.on("load", () => {
        if (!disposed) {
          setLoaded(true);
          setError("");
        }
      });

      map.on("error", () => {
        if (!disposed) {
          setError("Some map content couldn’t load. Check your connection if the map stays blank.");
        }
      });

      observer = new ResizeObserver(() => map?.resize());
      observer.observe(containerRef.current);
    } catch {
      setError("The map couldn’t start. Check browser WebGL support and refresh.");
    }

    return () => {
      disposed = true;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const markers: Record<string, Marker> = {};
    const bounds = new LngLatBounds();

    pins.forEach((pin, index) => {
      const coordinates: [number, number] = [pin.longitude, pin.latitude];
      bounds.extend(coordinates);

      const element = document.createElement("button");
      element.type = "button";
      element.textContent = String(index + 1);
      element.setAttribute("aria-label", `Show ${pin.title}`);

      Object.assign(element.style, {
        width: "42px",
        height: "42px",
        borderRadius: pin.kind === "city" ? "50%" : "12px",
        border: "3px solid white",
        backgroundColor: pin.kind === "city" ? "#a94f35" : "#263b40",
        color: "white",
        fontSize: "16px",
        fontWeight: "700",
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(38,59,64,0.25)",
      });

      markers[pin.id] = new Marker({ element })
        .setLngLat(coordinates)
        .setPopup(
          new Popup({ offset: 28 }).setText(`${pin.title} — ${pin.label}`),
        )
        .addTo(map);
    });

    markersRef.current = markers;

    if (pins.length > 0) {
      map.fitBounds(bounds, {
        padding: 70,
        maxZoom: pins.length === 1 ? 12 : 7,
        duration: 0,
      });
    } else {
      map.jumpTo({ center: [0, 25], zoom: 1.5 });
    }

    return () => {
      Object.values(markers).forEach((marker) => marker.remove());
      markersRef.current = {};
    };
  }, [pins, loaded]);

  function focusPin(pin: MapPin) {
    const map = mapRef.current;
    if (!map) return;

    Object.values(markersRef.current).forEach((marker) => {
      marker.getPopup()?.remove();
    });

    map.flyTo({
      center: [pin.longitude, pin.latitude],
      zoom: 13,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 1000,
    });

    const marker = markersRef.current[pin.id];

    if (marker && !marker.getPopup()?.isOpen()) {
      marker.togglePopup();
    }
  }

  return (
    <section aria-label="Interactive trip map" className="min-w-0">
      <div className="relative isolate overflow-hidden rounded-3xl border border-foreground/10 bg-sky">
        <div ref={containerRef} className="h-[500px] w-full sm:h-[620px]" />

        {!loaded && !error && (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-sky/90"
          >
            <p className="rounded-full bg-white px-5 py-3 text-sm font-medium">
              Unfolding the map…
            </p>
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-terracotta">{error}</p>}

      <p className="mt-3 text-xs text-muted">
        Round pins: destinations. Square pins: activities.
        Pin numbers follow the list below.
      </p>

      {pins.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pins.map((pin, index) => (
            <Button
              key={pin.id}
              variant="secondary"
              disabled={!loaded}
              onClick={() => focusPin(pin)}
            >
              {index + 1}. {pin.title}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
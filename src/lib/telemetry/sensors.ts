import type { TelemetryData } from "../../types/intelligence";

/**
 * Reads Geolocation and Device Orientation gracefully.
 * Degrades gracefully (null) when permissions denied or unavailable.
 */
export async function getDeviceTelemetry(): Promise<TelemetryData> {
  const result: TelemetryData = {
    coordinates: null,
    elevationMeters: null,
    bearing: null,
    timestamp: Date.now(),
  };

  // 1. Geolocation
  if (typeof navigator !== "undefined" && "geolocation" in navigator) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 4000,
          maximumAge: 10000,
        });
      });

      result.coordinates = [
        Number(position.coords.latitude.toFixed(6)),
        Number(position.coords.longitude.toFixed(6)),
      ];

      if (position.coords.altitude !== null && !isNaN(position.coords.altitude)) {
        result.elevationMeters = Math.round(position.coords.altitude);
      }

      if (position.coords.heading !== null && !isNaN(position.coords.heading)) {
        result.bearing = Math.round(position.coords.heading);
      }
    } catch {
      // Permission denied or timeout - graceful fallback to null
    }
  }

  // 2. Device Orientation (Compass) if heading wasn't found from GPS
  if (result.bearing === null && typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
    try {
      const orientation = await new Promise<number | null>((resolve) => {
        const handler = (event: DeviceOrientationEvent) => {
          window.removeEventListener("deviceorientation", handler);
          let compass: number | null = null;
          const safariEvent = event as unknown as { webkitCompassHeading?: number };
          if (typeof safariEvent.webkitCompassHeading === "number") {
            compass = safariEvent.webkitCompassHeading;
          } else if (event.alpha != null) {
            compass = 360 - event.alpha;
          }
          resolve(compass != null ? Math.round(compass) : null);
        };
        window.addEventListener("deviceorientation", handler, { once: true });
        setTimeout(() => {
          window.removeEventListener("deviceorientation", handler);
          resolve(null);
        }, 500);
      });
      if (orientation !== null) {
        result.bearing = orientation;
      }
    } catch {
      // Degrade gracefully
    }
  }

  return result;
}

/**
 * Predefined realistic test coordinates along the DHR corridor for testing/simulation
 */
export const DHR_TEST_POINTS: Record<string, TelemetryData> = {
  tindharia: {
    coordinates: [26.8525, 88.3339],
    elevationMeters: 860,
    bearing: 312,
    timestamp: Date.now(),
  },
  paglaJhora: {
    coordinates: [26.869, 88.314],
    elevationMeters: 1150,
    bearing: 285,
    timestamp: Date.now(),
  },
  kurseong: {
    coordinates: [26.8812, 88.2789],
    elevationMeters: 1483,
    bearing: 15,
    timestamp: Date.now(),
  },
  ghum: {
    coordinates: [27.0094, 88.2589],
    elevationMeters: 2258,
    bearing: 44,
    timestamp: Date.now(),
  },
  batasiaLoop: {
    coordinates: [27.0168, 88.2528],
    elevationMeters: 2100,
    bearing: 190,
    timestamp: Date.now(),
  },
};

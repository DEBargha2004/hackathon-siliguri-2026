import landmarksData from "./geo-corridor.json";
import type {
  HazardContext,
  HazardType,
  LandmarkProximity,
  Severity,
  TelemetryData,
} from "../../types/intelligence";

interface DhrLandmark {
  id: string;
  name: string;
  coordinates: [number, number];
  elevationMeters: number;
  chainageKm: number;
  description: string;
}

const landmarks: DhrLandmark[] = landmarksData as DhrLandmark[];

/**
 * Calculates haversine distance in meters between two lat/lon coordinates
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculates cardinal direction from origin to target
 */
export function calculateCompassDirection(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): string {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLon);

  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  brng = (brng + 360) % 360;

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(brng / 45) % 8;
  return directions[index];
}

/**
 * Finds the nearest DHR landmark completely offline
 */
export function findNearestLandmark(
  lat: number,
  lon: number
): LandmarkProximity | null {
  if (landmarks.length === 0) return null;

  let closest: DhrLandmark | null = null;
  let minDistance = Infinity;

  for (const lm of landmarks) {
    const dist = calculateHaversineDistance(lat, lon, lm.coordinates[0], lm.coordinates[1]);
    if (dist < minDistance) {
      minDistance = dist;
      closest = lm;
    }
  }

  if (!closest) return null;

  const roundedMeters = Math.round(minDistance);
  const direction = calculateCompassDirection(closest.coordinates[0], closest.coordinates[1], lat, lon);

  let label: string;
  if (roundedMeters < 50) {
    label = `At ${closest.name} (KM ${closest.chainageKm.toFixed(1)})`;
  } else if (roundedMeters < 1000) {
    label = `${roundedMeters}m ${direction} of ${closest.name} (KM ${closest.chainageKm.toFixed(1)})`;
  } else {
    const km = (roundedMeters / 1000).toFixed(1);
    label = `${km}km ${direction} from ${closest.name} (KM ${closest.chainageKm.toFixed(1)})`;
  }

  return {
    landmarkId: closest.id,
    name: closest.name,
    distanceMeters: roundedMeters,
    chainageKm: closest.chainageKm,
    elevationMeters: closest.elevationMeters,
    description: closest.description,
    label,
  };
}

/**
 * Merges vision classification with device telemetry into canonical HazardContext
 */
export function fuseHazardContext(
  hazardType: HazardType,
  severity: Severity,
  visionConfidence: number,
  telemetryInput?: Partial<TelemetryData> | null
): HazardContext {
  const timestamp = telemetryInput?.timestamp ?? Date.now();
  const coordinates = telemetryInput?.coordinates ?? null;
  const elevationMeters = telemetryInput?.elevationMeters ?? null;
  const bearing = telemetryInput?.bearing ?? null;

  let proximityLandmark: LandmarkProximity | null = null;
  if (coordinates && coordinates[0] != null && coordinates[1] != null) {
    proximityLandmark = findNearestLandmark(coordinates[0], coordinates[1]);
  }

  return {
    hazardType,
    severity,
    visionConfidence: Number(visionConfidence.toFixed(2)),
    telemetry: {
      coordinates,
      elevationMeters,
      bearing,
      timestamp,
    },
    proximityLandmark,
  };
}

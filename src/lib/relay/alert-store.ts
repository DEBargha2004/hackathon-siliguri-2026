import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { OfficialAlert } from "@/types/alert";

export const ALERTS_DB_NAME = "dhr-alerts-db";
export const ALERTS_DB_VERSION = 1;
export const ALERTS_STORE_NAME = "official_alerts";
export const SEEN_STORE_NAME = "seen_alert_ids";

export const MAX_HOP_COUNT = 6;

export interface SeenAlertRecord {
  id: string;
  seenAt: number;
}

export interface DHRAlertsDBSchema extends DBSchema {
  official_alerts: {
    key: string;
    value: OfficialAlert;
    indexes: {
      "by-issuedAt": number;
      "by-severity": string;
      "by-hazardType": string;
    };
  };
  seen_alert_ids: {
    key: string;
    value: SeenAlertRecord;
  };
}

let alertsDbPromise: Promise<IDBPDatabase<DHRAlertsDBSchema>> | null = null;

export function getAlertsDB(): Promise<IDBPDatabase<DHRAlertsDBSchema>> {
  if (!alertsDbPromise) {
    alertsDbPromise = openDB<DHRAlertsDBSchema>(ALERTS_DB_NAME, ALERTS_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(ALERTS_STORE_NAME)) {
          const store = db.createObjectStore(ALERTS_STORE_NAME, {
            keyPath: "id",
          });
          store.createIndex("by-issuedAt", "issuedAt");
          store.createIndex("by-severity", "severity");
          store.createIndex("by-hazardType", "hazardType");
        }
        if (!db.objectStoreNames.contains(SEEN_STORE_NAME)) {
          db.createObjectStore(SEEN_STORE_NAME, {
            keyPath: "id",
          });
        }
      },
    });
  }
  return alertsDbPromise;
}

/**
 * Check if an alert ID has already been seen/cached.
 */
export async function isAlertSeen(id: string): Promise<boolean> {
  const db = await getAlertsDB();
  const seen = await db.get(SEEN_STORE_NAME, id);
  return Boolean(seen);
}

/**
 * Mark an alert ID as seen.
 */
export async function markAlertSeen(id: string): Promise<void> {
  const db = await getAlertsDB();
  await db.put(SEEN_STORE_NAME, {
    id,
    seenAt: Date.now(),
  });
}

/**
 * Save an official alert into local IndexedDB with deduplication check.
 * Returns { success: true, isDuplicate: false } if saved.
 * Returns { success: false, isDuplicate: true } if already seen.
 */
export async function saveOfficialAlert(
  alert: OfficialAlert,
  options?: { forceUpdate?: boolean }
): Promise<{ success: boolean; isDuplicate: boolean }> {
  const db = await getAlertsDB();

  const alreadySeen = await isAlertSeen(alert.id);
  if (alreadySeen && !options?.forceUpdate) {
    return { success: false, isDuplicate: true };
  }

  const tx = db.transaction([ALERTS_STORE_NAME, SEEN_STORE_NAME], "readwrite");
  const alertsStore = tx.objectStore(ALERTS_STORE_NAME);
  const seenStore = tx.objectStore(SEEN_STORE_NAME);

  await alertsStore.put(alert);
  await seenStore.put({
    id: alert.id,
    seenAt: Date.now(),
  });

  await tx.done;
  return { success: true, isDuplicate: false };
}

/**
 * Retrieve a single official alert by its stable ID.
 */
export async function getOfficialAlertById(
  id: string
): Promise<OfficialAlert | undefined> {
  const db = await getAlertsDB();
  return db.get(ALERTS_STORE_NAME, id);
}

/**
 * List all official alerts cached on the device, sorted newest first.
 */
export async function listOfficialAlerts(): Promise<OfficialAlert[]> {
  const db = await getAlertsDB();
  const alerts = await db.getAll(ALERTS_STORE_NAME);
  return alerts.sort((a, b) => b.issuedAt - a.issuedAt);
}

/**
 * Track dismissed alert IDs in localStorage to prevent auto-reimporting them.
 */
export function markAlertDismissed(id: string): void {
  try {
    const raw = localStorage.getItem("dhr_dismissed_alerts");
    const dismissed: string[] = raw ? JSON.parse(raw) : [];
    if (!dismissed.includes(id)) {
      dismissed.push(id);
      localStorage.setItem("dhr_dismissed_alerts", JSON.stringify(dismissed));
    }
  } catch {
    // ignore
  }
}

export function isAlertDismissed(id: string): boolean {
  try {
    const raw = localStorage.getItem("dhr_dismissed_alerts");
    const dismissed: string[] = raw ? JSON.parse(raw) : [];
    return dismissed.includes(id);
  } catch {
    return false;
  }
}

export function clearDismissedAlerts(): void {
  try {
    localStorage.removeItem("dhr_dismissed_alerts");
  } catch {
    // ignore
  }
}

/**
 * Delete an alert by ID.
 */
export async function deleteOfficialAlert(id: string): Promise<void> {
  markAlertDismissed(id);
  const db = await getAlertsDB();
  await db.delete(ALERTS_STORE_NAME, id);
}

/**
 * Validate whether an alert can be relayed further based on hopCount.
 */
export function canRelayAlert(alert: OfficialAlert): {
  allowed: boolean;
  reason?: string;
} {
  if (alert.hopCount >= MAX_HOP_COUNT) {
    return {
      allowed: false,
      reason: `Relay limit reached: Alert has travelled ${alert.hopCount} hops (Max: ${MAX_HOP_COUNT}). Rebroadcasting is capped to prevent infinite corridor looping.`,
    };
  }
  return { allowed: true };
}

import { listAllReports } from "@/lib/queue/report-store";

/**
 * Ensures any raw data loaded from IndexedDB is a valid Blob instance.
 */
export function ensureBlob(raw: unknown): Blob {
  if (raw instanceof Blob) {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return new Blob([raw], { type: "image/jpeg" });
  }
  if (
    raw &&
    typeof raw === "object" &&
    "buffer" in raw &&
    (raw as { buffer: unknown }).buffer instanceof ArrayBuffer
  ) {
    return new Blob([(raw as { buffer: ArrayBuffer }).buffer], {
      type: "image/jpeg",
    });
  }
  return new Blob([], { type: "image/jpeg" });
}

/**
 * Converts a specific ReportRecord from local storage (IndexedDB)
 * into a relayable OfficialAlert.
 */
export async function convertReportToOfficialAlert(
  report: import("@/types/report").ReportRecord
): Promise<OfficialAlert> {
  const targetAlertId = `dhr-report-${report.id}`;

  const hazardType = (report.context.hazardType || "LANDSLIDE_SLIP") as
    | "LANDSLIDE_SLIP"
    | "TRACK_ROAD_BLOCKAGE"
    | "WATER_SEEPAGE";

  const severity = (report.context.severity || "CRITICAL") as
    | "CRITICAL"
    | "WARNING"
    | "MONITOR";

  const locationName =
    report.context.proximityLandmark?.name ||
    report.context.proximityLandmark?.label ||
    (report.context.telemetry?.coordinates
      ? `${report.context.telemetry.coordinates[0].toFixed(3)}°N, ${report.context.telemetry.coordinates[1].toFixed(3)}°E`
      : undefined);

  // Clean, focused instruction without technical suffixes
  const message =
    report.advisory.hazardLabel && report.advisory.immediateAction
      ? `${report.advisory.hazardLabel}: ${report.advisory.immediateAction}`
      : report.advisory.immediateAction || report.advisory.hazardLabel || "Slope hazard detected along corridor";

  const coords: [number, number] | undefined =
    report.context.telemetry?.coordinates
      ? [report.context.telemetry.coordinates[0], report.context.telemetry.coordinates[1]]
      : undefined;

  const alert: OfficialAlert = {
    id: targetAlertId,
    hazardType,
    severity,
    message,
    locationName,
    coordinates: coords,
    issuedAt: report.createdAt,
    photoBlob: ensureBlob(report.photoBlob),
    hopCount: 0,
  };

  await saveOfficialAlert(alert, { forceUpdate: true });
  return alert;
}

/**
 * Selectively converts multiple selected ReportRecords by their IDs into OfficialAlerts.
 */
export async function convertReportsToOfficialAlerts(
  reportIds: string[]
): Promise<OfficialAlert[]> {
  const localReports = await listAllReports();
  const idSet = new Set(reportIds);
  const matched = localReports.filter((r) => idSet.has(r.id));

  const converted: OfficialAlert[] = [];
  for (const report of matched) {
    const alert = await convertReportToOfficialAlert(report);
    converted.push(alert);
  }
  return converted;
}

/**
 * Creates and stores a dynamic official alert from an uploaded photo.
 */
export async function createOfficialAlertFromUpload(
  photoBlob: Blob,
  params: {
    hazardType: "LANDSLIDE_SLIP" | "TRACK_ROAD_BLOCKAGE" | "WATER_SEEPAGE";
    severity: "CRITICAL" | "WARNING" | "MONITOR";
    message: string;
    coordinates?: [number, number];
  }
): Promise<OfficialAlert> {
  const alert: OfficialAlert = {
    id: `dhr-upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    hazardType: params.hazardType,
    severity: params.severity,
    message: params.message,
    coordinates: params.coordinates,
    issuedAt: Date.now(),
    photoBlob: ensureBlob(photoBlob),
    hopCount: 0,
  };

  await saveOfficialAlert(alert, { forceUpdate: true });
  return alert;
}

/**
 * Import all locally saved hazard reports
 * (captured/uploaded in the Hazard Analyzer) into official alerts for relay.
 */
export async function importReportsFromLocalQueue(): Promise<{
  importedCount: number;
  totalLocalReports: number;
}> {
  const localReports = await listAllReports();
  let importedCount = 0;

  for (const report of localReports) {
    const targetAlertId = `dhr-report-${report.id}`;
    const alreadySaved = await getOfficialAlertById(targetAlertId);
    if (alreadySaved) continue;

    await convertReportToOfficialAlert(report);
    importedCount++;
  }

  return {
    importedCount,
    totalLocalReports: localReports.length,
  };
}


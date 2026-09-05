import { getSupabase } from "@/lib/supabase/client";
import type { OfficialAlert, HazardType, AlertSeverity } from "@/types/alert";
import { getOfficialAlertById, saveOfficialAlert, unmarkAlertDismissed } from "./alert-store";

export interface SupabaseAlertRow {
  id: string;
  created_at: string;
  hazard_type?: string;
  severity?: string;
  message?: string;
  landmark_label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
  hop_count?: number | null;
  advisory?: {
    hazardLabel?: string;
    immediateAction?: string;
    relayPriority?: string;
  } | null;
  context?: {
    hazardType?: string;
    severity?: string;
    visionConfidence?: number;
    proximityLandmark?: { label?: string };
    telemetry?: {
      coordinates?: [number, number];
      elevationMeters?: number;
    };
  } | null;
}

/**
 * Creates a valid emergency placeholder SVG Blob when an image cannot be fetched over poor cellular connectivity.
 */
function createEmergencyPlaceholderBlob(title = "Hazard Advisory"): Blob {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#18181b"/>
    <rect x="20" y="20" width="560" height="360" rx="12" fill="#27272a" stroke="#ef4444" stroke-width="2"/>
    <circle cx="300" cy="160" r="50" fill="#7f1d1d" fill-opacity="0.5"/>
    <path d="M300 130 L325 180 L275 180 Z" fill="#f87171"/>
    <text x="300" y="250" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#f43f5e" text-anchor="middle">EMERGENCY CORRIDOR REPORT</text>
    <text x="300" y="280" font-family="system-ui, sans-serif" font-size="14" fill="#a1a1aa" text-anchor="middle">${title}</text>
  </svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

/**
 * Downloads an evidence photo from Supabase Storage or public URL into a local Blob.
 * Protected with timeout to prevent hanging.
 */
export async function downloadPhotoBlob(photoUrl: string, timeoutMs = 6000): Promise<Blob> {
  const supabase = getSupabase();
  let targetUrl = photoUrl;

  // Check if photoUrl is a relative Supabase storage path like "hazard-photos/my-photo.jpg"
  if (supabase && !photoUrl.startsWith("http://") && !photoUrl.startsWith("https://")) {
    const cleanPath = photoUrl.replace(/^hazard-photos\//, "");
    const { data } = supabase.storage.from("hazard-photos").getPublicUrl(cleanPath);
    if (data?.publicUrl) {
      targetUrl = data.publicUrl;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      throw new Error(`Failed to fetch alert photo from ${targetUrl} (HTTP ${response.status})`);
    }
    return await response.blob();
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[AlertIngestion] Could not download photo from ${targetUrl}:`, err);
    return createEmergencyPlaceholderBlob("Evidence Photo");
  }
}

/**
 * Maps a raw Supabase database row (from hazard_reports or official_alerts) to canonical OfficialAlert.
 */
export async function mapRowToOfficialAlert(row: SupabaseAlertRow): Promise<OfficialAlert> {
  let photoBlob: Blob;

  if (row.photo_url) {
    try {
      photoBlob = await downloadPhotoBlob(row.photo_url);
    } catch {
      photoBlob = createEmergencyPlaceholderBlob(row.advisory?.hazardLabel || "Evidence Photo");
    }
  } else {
    photoBlob = createEmergencyPlaceholderBlob(row.advisory?.hazardLabel || "Evidence Photo");
  }

  const rawHazard = (row.hazard_type || row.context?.hazardType || "").toUpperCase();
  const hazardType: HazardType =
    rawHazard.includes("TRACK") || rawHazard.includes("BLOCK")
      ? "TRACK_ROAD_BLOCKAGE"
      : rawHazard.includes("WATER") || rawHazard.includes("SEEP") || rawHazard.includes("CULVERT")
      ? "WATER_SEEPAGE"
      : "LANDSLIDE_SLIP";

  const rawSeverity = (row.severity || row.context?.severity || "").toUpperCase();
  const severity: AlertSeverity =
    rawSeverity.includes("CRIT") || rawSeverity.includes("HIGH")
      ? "CRITICAL"
      : rawSeverity.includes("WARN") || rawSeverity.includes("MED")
      ? "WARNING"
      : "MONITOR";

  const coordinates: [number, number] | undefined =
    row.latitude != null && row.longitude != null
      ? [row.latitude, row.longitude]
      : row.context?.telemetry?.coordinates;

  const issuedAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();

  let message = row.message;
  if (!message) {
    const parts: string[] = [];
    if (row.advisory?.hazardLabel) parts.push(row.advisory.hazardLabel);
    if (row.landmark_label) parts.push(`📍 ${row.landmark_label}`);
    if (row.advisory?.immediateAction) parts.push(`Action: ${row.advisory.immediateAction}`);
    message = parts.join(" • ") || "Official Corridor Advisory";
  }

  return {
    id: row.id,
    hazardType,
    severity,
    message,
    coordinates,
    issuedAt,
    photoBlob,
    hopCount: row.hop_count ?? 0,
  };
}

/**
 * Ingest new official alerts from Supabase.
 * Checks both 'hazard_reports' (live synced field reports) and 'official_alerts'.
 */
export async function syncOfficialAlerts(options?: {
  forceSync?: boolean;
}): Promise<{
  ingestedCount: number;
  totalFound: number;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      ingestedCount: 0,
      totalFound: 0,
      error: "Supabase credentials not configured or network offline",
    };
  }

  try {
    // 1. Fetch from 'hazard_reports' (primary active table where emergency reports are synced)
    const { data: hazardRows, error: hazardError } = await supabase
      .from("hazard_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);

    const rows: SupabaseAlertRow[] = [];

    if (!hazardError && hazardRows) {
      rows.push(...(hazardRows as unknown as SupabaseAlertRow[]));
    }

    // 2. Also query 'official_alerts' table if present in schema
    try {
      const { data: officialRows, error: officialError } = await supabase
        .from("official_alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!officialError && officialRows) {
        const existingIds = new Set(rows.map((r) => r.id));
        for (const row of officialRows as SupabaseAlertRow[]) {
          if (!existingIds.has(row.id)) {
            rows.push(row);
          }
        }
      }
    } catch {
      // official_alerts table may not exist; safe to ignore
    }

    if (hazardError && rows.length === 0) {
      return {
        ingestedCount: 0,
        totalFound: 0,
        error: hazardError.message,
      };
    }

    if (rows.length === 0) {
      return { ingestedCount: 0, totalFound: 0 };
    }

    let ingestedCount = 0;
    for (const row of rows) {
      // On manual user sync, unmark dismissal so user sees fresh cloud alerts
      if (options?.forceSync) {
        unmarkAlertDismissed(row.id);
        unmarkAlertDismissed(`dhr-report-${row.id}`);
      }

      // Check if already in IndexedDB
      const existing = await getOfficialAlertById(row.id);
      if (existing && !options?.forceSync) {
        continue;
      }

      const alert = await mapRowToOfficialAlert(row);
      const res = await saveOfficialAlert(alert, { forceUpdate: true });
      if (res.success) {
        ingestedCount++;
      }
    }

    return {
      ingestedCount,
      totalFound: rows.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[AlertIngestion] Sync failed:", msg);
    return {
      ingestedCount: 0,
      totalFound: 0,
      error: msg,
    };
  }
}

/**
 * Sets up a Realtime subscription for incoming official alerts from Supabase.
 * Automatically ingests and caches alerts locally when received online.
 */
export function subscribeToOfficialAlerts(
  onNewAlert?: (alert: OfficialAlert) => void
): () => void {
  const supabase = getSupabase();
  if (!supabase) {
    return () => {};
  }

  const channel = supabase
    .channel("corridor_hazard_reports_realtime")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "hazard_reports",
      },
      async (payload) => {
        const row = payload.new as unknown as SupabaseAlertRow;
        if (!row?.id) return;

        try {
          const alert = await mapRowToOfficialAlert(row);
          const res = await saveOfficialAlert(alert, { forceUpdate: true });
          if (res.success && onNewAlert) {
            onNewAlert(alert);
          }
        } catch (err) {
          console.error("[AlertIngestion] Failed to ingest realtime hazard report:", err);
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "official_alerts",
      },
      async (payload) => {
        const row = payload.new as SupabaseAlertRow;
        if (!row?.id) return;

        try {
          const alert = await mapRowToOfficialAlert(row);
          const res = await saveOfficialAlert(alert, { forceUpdate: true });
          if (res.success && onNewAlert) {
            onNewAlert(alert);
          }
        } catch (err) {
          console.error("[AlertIngestion] Failed to ingest realtime official alert:", err);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

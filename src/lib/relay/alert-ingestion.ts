import { getSupabase } from "@/lib/supabase/client";
import type { OfficialAlert, HazardType, AlertSeverity } from "@/types/alert";
import { isAlertSeen, saveOfficialAlert } from "./alert-store";

export interface SupabaseAlertRow {
  id: string;
  created_at: string;
  hazard_type: string;
  severity: string;
  message: string;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
  hop_count?: number | null;
}

/**
 * Downloads an evidence photo from Supabase Storage or public URL into a local Blob.
 */
export async function downloadPhotoBlob(photoUrl: string): Promise<Blob> {
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

  const response = await fetch(targetUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch alert photo from ${targetUrl} (HTTP ${response.status})`);
  }
  return response.blob();
}

/**
 * Maps a raw Supabase database row to canonical OfficialAlert with downloaded photoBlob.
 */
export async function mapRowToOfficialAlert(row: SupabaseAlertRow): Promise<OfficialAlert> {
  let photoBlob: Blob;

  if (row.photo_url) {
    try {
      photoBlob = await downloadPhotoBlob(row.photo_url);
    } catch (err) {
      console.warn(`[AlertIngestion] Failed to download photo for alert ${row.id}:`, err);
      // Fallback 1x1 placeholder blob
      photoBlob = new Blob(["offline-placeholder-photo"], { type: "image/jpeg" });
    }
  } else {
    photoBlob = new Blob(["offline-placeholder-photo"], { type: "image/jpeg" });
  }

  const hazardType = (
    ["LANDSLIDE_SLIP", "TRACK_ROAD_BLOCKAGE", "WATER_SEEPAGE"].includes(row.hazard_type)
      ? row.hazard_type
      : "LANDSLIDE_SLIP"
  ) as HazardType;

  const severity = (
    ["CRITICAL", "WARNING", "MONITOR"].includes(row.severity)
      ? row.severity
      : "WARNING"
  ) as AlertSeverity;

  const coordinates: [number, number] | undefined =
    row.latitude != null && row.longitude != null
      ? [row.latitude, row.longitude]
      : undefined;

  const issuedAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();

  return {
    id: row.id,
    hazardType,
    severity,
    message: row.message || "Official Corridor Advisory",
    coordinates,
    issuedAt,
    photoBlob,
    hopCount: row.hop_count ?? 0,
  };
}

/**
 * Ingest new official alerts from Supabase.
 * Fetches records from 'official_alerts' table that have not been cached yet.
 * Returns the count of newly ingested alerts.
 */
export async function syncOfficialAlerts(): Promise<{
  ingestedCount: number;
  totalFound: number;
  error?: string;
}> {
  const supabase = getSupabase();
  if (!supabase) {
    return {
      ingestedCount: 0,
      totalFound: 0,
      error: "Supabase client not configured or offline",
    };
  }

  try {
    const { data: rows, error } = await supabase
      .from("official_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      // If table doesn't exist yet, return clean diagnostic
      return {
        ingestedCount: 0,
        totalFound: 0,
        error: error.message,
      };
    }

    if (!rows || rows.length === 0) {
      return { ingestedCount: 0, totalFound: 0 };
    }

    let ingestedCount = 0;
    for (const row of rows as SupabaseAlertRow[]) {
      const alreadySeen = await isAlertSeen(row.id);
      if (alreadySeen) {
        continue;
      }

      const alert = await mapRowToOfficialAlert(row);
      const res = await saveOfficialAlert(alert);
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
    .channel("official_alerts_realtime")
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

        const alreadySeen = await isAlertSeen(row.id);
        if (alreadySeen) return;

        try {
          const alert = await mapRowToOfficialAlert(row);
          const res = await saveOfficialAlert(alert);
          if (res.success && onNewAlert) {
            onNewAlert(alert);
          }
        } catch (err) {
          console.error("[AlertIngestion] Failed to ingest realtime alert:", err);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

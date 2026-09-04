import type { ReportRecord } from "@/types/report";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

export interface SyncTransport {
  name: string;
  send(record: ReportRecord): Promise<void>;
  checkHealth?(): Promise<{ ok: boolean; message: string }>;
}

export interface HttpSyncTransportOptions {
  endpointUrl?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Production HTTP Transport:
 * Sends context, advisory, and photoBlob via multipart/form-data to a REST endpoint.
 * Sets X-Idempotency-Key header to record.id to prevent duplicate ingestion.
 */
export class HttpSyncTransport implements SyncTransport {
  readonly name = "HTTP Transport";
  private endpointUrl: string;
  private timeoutMs: number;
  private headers: Record<string, string>;

  constructor(options: HttpSyncTransportOptions = {}) {
    this.endpointUrl =
      options.endpointUrl ||
      (typeof import.meta !== "undefined" && import.meta.env?.VITE_REPORT_SYNC_ENDPOINT) ||
      "/api/reports";
    this.timeoutMs = options.timeoutMs || 15000;
    this.headers = options.headers || {};
  }

  async send(record: ReportRecord): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const formData = new FormData();
      formData.append("id", record.id);
      formData.append("createdAt", String(record.createdAt));
      formData.append("context", JSON.stringify(record.context));
      formData.append("advisory", JSON.stringify(record.advisory));

      // Append evidence photo blob
      if (record.photoBlob) {
        const filename = `hazard-${record.id}.jpg`;
        formData.append("photo", record.photoBlob, filename);
      }

      const response = await fetch(this.endpointUrl, {
        method: "POST",
        headers: {
          "X-Idempotency-Key": record.id,
          ...this.headers,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(
          `Sync transport rejected with status ${response.status}: ${errorText.slice(0, 150)}`
        );
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error(`Sync transport timed out after ${this.timeoutMs}ms`, { cause: err });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch("/api/health", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        return { ok: true, message: data.service || "Connected to Gateway" };
      }
      return { ok: false, message: `HTTP status ${res.status}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gateway unreachable";
      return { ok: false, message: msg };
    }
  }
}

/**
 * Production Supabase Cloud Transport:
 * Stores photo blobs in Supabase Storage bucket 'hazard-photos'
 * and upserts records into PostgreSQL table 'hazard_reports'.
 */
export class SupabaseSyncTransport implements SyncTransport {
  readonly name = "Supabase Cloud Transport";
  private bucketName: string;

  constructor(bucketName = "hazard-photos") {
    this.bucketName = bucketName;
  }

  async send(record: ReportRecord): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error("Supabase is not configured. Please supply URL and Anon Key.");
    }

    // 1. Upload photo blob to Supabase Storage bucket
    let photoUrl = "";
    if (record.photoBlob && record.photoBlob.size > 0) {
      const filename = `hazard-${record.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(this.bucketName)
        .upload(filename, record.photoBlob, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        console.warn("[SupabaseSyncTransport] Storage upload warning:", uploadError);
        // Do not block row insertion if bucket RLS isn't set yet; try publicUrl anyway
      }

      const { data: urlData } = supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filename);
      photoUrl = urlData?.publicUrl || "";
    }

    // 2. Upsert report record into PostgreSQL table
    const row = {
      id: record.id,
      created_at: new Date(record.createdAt).toISOString(),
      synced_at: new Date().toISOString(),
      hazard_type: record.context.hazardType || record.advisory.hazardLabel || "UNKNOWN",
      severity: record.context.severity || "MEDIUM",
      vision_confidence: record.context.visionConfidence ?? null,
      landmark_label: record.context.proximityLandmark?.label ?? null,
      latitude: record.context.telemetry?.coordinates?.[0] ?? null,
      longitude: record.context.telemetry?.coordinates?.[1] ?? null,
      altitude: record.context.telemetry?.elevationMeters ?? null,
      photo_url: photoUrl,
      context: record.context,
      advisory: record.advisory,
    };

    const { error: dbError } = await supabase
      .from("hazard_reports")
      .upsert(row, { onConflict: "id" });

    if (dbError) {
      throw new Error(`Supabase table upsert failed: ${dbError.message}`);
    }

    console.log(`[SupabaseSyncTransport] Successfully pushed report ${record.id} to Supabase!`);
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    const supabase = getSupabase();
    if (!supabase) {
      return { ok: false, message: "Credentials not configured" };
    }
    try {
      const { error } = await supabase.from("hazard_reports").select("id").limit(1);
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true, message: "Supabase Connected" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      return { ok: false, message: msg };
    }
  }
}

export interface MockSyncTransportOptions {
  delayMs?: number;
  failureRate?: number; // 0.0 (always succeed) to 1.0 (always fail)
  forceFail?: boolean;
}

/**
 * Mock Transport for Offline / Sandbox / Demo testing:
 * Simulates a reliable or flaky remote server ingestion with artificial network delay.
 */
export class MockSyncTransport implements SyncTransport {
  readonly name = "Mock / Demo Transport";
  public delayMs: number;
  public failureRate: number;
  public forceFail: boolean;

  constructor(options: MockSyncTransportOptions = {}) {
    this.delayMs = options.delayMs ?? 600;
    this.failureRate = options.failureRate ?? 0;
    this.forceFail = options.forceFail ?? false;
  }

  async send(record: ReportRecord): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));

    if (this.forceFail || (this.failureRate > 0 && Math.random() < this.failureRate)) {
      throw new Error("Simulated uplink transport drop (Weak 2G mountain signal)");
    }

    console.log(
      `[MockSyncTransport] Ingested report ${record.id} (${record.context.hazardType}, ${record.context.severity})`
    );
  }

  async checkHealth(): Promise<{ ok: boolean; message: string }> {
    if (this.forceFail) {
      return { ok: false, message: "Forced drop active" };
    }
    return { ok: true, message: "Sandbox Mock Ready" };
  }
}

/**
 * Helper to dynamically create the primary active transport:
 * 1. Supabase if configured with credentials
 * 2. Real HTTP endpoint (/api/reports)
 */
export function createDefaultSyncTransport(): SyncTransport {
  if (isSupabaseConfigured()) {
    return new SupabaseSyncTransport();
  }
  return new HttpSyncTransport();
}

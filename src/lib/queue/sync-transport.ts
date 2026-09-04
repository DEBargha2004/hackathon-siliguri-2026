import type { ReportRecord } from "@/types/report";

export interface SyncTransport {
  name: string;
  send(record: ReportRecord): Promise<void>;
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
      const filename = `hazard-${record.id}.jpg`;
      formData.append("photo", record.photoBlob, filename);

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

    // Success simulation
    console.log(
      `[MockSyncTransport] Successfully ingested report ${record.id} (${record.context.hazardType}, ${record.context.severity})`
    );
  }
}

import type { QueueEvent, ReportRecord } from "@/types/report";
import {
  getQueueStats,
  listReportsByStatus,
  markReportFailed,
  markReportSynced,
  markReportSyncing,
} from "./report-store";
import {
  createDefaultSyncTransport,
  type SyncTransport,
} from "./sync-transport";

export type QueueListener = (event: QueueEvent) => void;

export interface SyncManagerOptions {
  transport?: SyncTransport;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

export class SyncManager {
  private static instance: SyncManager | null = null;
  private transport: SyncTransport;
  private isSyncing = false;
  private maxRetries: number;
  private baseBackoffMs: number;
  private maxBackoffMs: number;
  private listeners: Set<QueueListener> = new Set();
  private abortController: AbortController | null = null;
  private activeTimers: Set<number> = new Set();

  private constructor(options: SyncManagerOptions = {}) {
    // Defaults to Supabase (if configured) or real HTTP gateway (/api/reports)
    this.transport = options.transport || createDefaultSyncTransport();

    this.maxRetries = options.maxRetries ?? 6;
    this.baseBackoffMs = options.baseBackoffMs ?? 1500;
    this.maxBackoffMs = options.maxBackoffMs ?? 60000;

    this.initTriggers();
  }

  public static getInstance(options?: SyncManagerOptions): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager(options);
    }
    return SyncManager.instance;
  }

  public setTransport(transport: SyncTransport): void {
    this.transport = transport;
  }

  public getTransport(): SyncTransport {
    return this.transport;
  }

  public refreshTransport(): SyncTransport {
    this.transport = createDefaultSyncTransport();
    return this.transport;
  }

  /**
   * Subscribe to queue state transitions
   */
  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    // Send immediate stats update on subscription
    getQueueStats().then((stats) => {
      listener({
        type: "STATS_UPDATED" as unknown as QueueEvent["type"],
        stats,
        timestamp: Date.now(),
      });
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: QueueEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("[SyncManager] Listener error:", err);
      }
    });
  }

  /**
   * Wire up automatic synchronization triggers:
   * 1. 'online' event listener
   * 2. App foregrounded ('visibilitychange' and 'focus')
   * 3. Background Sync API registration
   */
  private initTriggers(): void {
    if (typeof window === "undefined") return;

    // Trigger 1: Universal online event listener
    window.addEventListener("online", () => {
      console.log("[SyncManager] Online event detected -> triggering queue flush");
      this.syncAll("TRIGGER_ONLINE");
    });

    // Trigger 2: App foregrounded / reopened
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        console.log("[SyncManager] App foregrounded -> checking pending reports");
        this.syncAll("TRIGGER_FOREGROUND");
      }
    });

    window.addEventListener("focus", () => {
      if (navigator.onLine) {
        this.syncAll("TRIGGER_FOCUS");
      }
    });

    // Initial check on startup if already online
    if (navigator.onLine) {
      setTimeout(() => this.syncAll("TRIGGER_STARTUP"), 1000);
    }
  }

  /**
   * Chromium Background Sync registration:
   * Degrades gracefully on Safari/Firefox without throwing or alarming the user.
   */
  public async requestBackgroundSync(): Promise<boolean> {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return false;
    }

    try {
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        const registration = await navigator.serviceWorker.ready;
        if (registration && "sync" in registration) {
          const syncReg = (registration as unknown as {
            sync: { register: (tag: string) => Promise<void> };
          }).sync;
          await syncReg.register("sync-reports");
          console.log("[SyncManager] Background Sync 'sync-reports' successfully registered");
          return true;
        }
      }
    } catch (err) {
      // Degrade silently — Safari, Firefox, and unconfigured SW contexts land here
      console.debug("[SyncManager] Background Sync unavailable or not allowed in this context:", err);
    }
    return false;
  }

  /**
   * Main synchronization pipeline:
   * Pulls PENDING and eligible FAILED records, synchronizing sequentially
   * to protect weak mountain hotspots.
   */
  public async syncAll(triggerReason = "MANUAL"): Promise<void> {
    if (this.isSyncing) {
      console.log(`[SyncManager] Sync already active. Skipping duplicate trigger (${triggerReason})`);
      return;
    }

    // Do not attempt if offline according to browser
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      console.log("[SyncManager] Device is currently offline. Queue remains stored in IndexedDB.");
      return;
    }

    this.isSyncing = true;
    this.abortController = new AbortController();

    try {
      // Fetch both PENDING and FAILED records
      const pendingRecords = await listReportsByStatus("PENDING");
      const failedRecords = await listReportsByStatus("FAILED");

      // Filter out failed records that exceeded max retries unless manually triggered
      const eligibleFailed = failedRecords.filter((r) => {
        if (triggerReason === "MANUAL") return true;
        return r.syncAttempts < this.maxRetries;
      });

      const queue = [...pendingRecords, ...eligibleFailed];

      if (queue.length === 0) {
        this.isSyncing = false;
        return;
      }

      console.log(
        `[SyncManager] Processing ${queue.length} reports via ${this.transport.name} (${triggerReason})...`
      );

      // Process strictly sequentially to prevent flooding weak 2G hotspots
      for (const record of queue) {
        if (this.abortController?.signal.aborted) break;

        await this.syncSingleRecord(record);
      }
    } catch (err) {
      console.error("[SyncManager] Batch sync error:", err);
    } finally {
      this.isSyncing = false;
      this.abortController = null;
    }
  }

  /**
   * Synchronize a single report record with idempotency and error tracking
   */
  private async syncSingleRecord(record: ReportRecord): Promise<void> {
    const recordId = record.id;

    try {
      // 1. Mark status SYNCING
      await markReportSyncing(recordId);
      const syncingStats = await getQueueStats();
      this.notify({
        type: "SYNC_STARTED",
        recordId,
        stats: syncingStats,
        timestamp: Date.now(),
      });

      // 2. Transmit via pluggable transport
      await this.transport.send(record);

      // 3. Mark status SYNCED
      await markReportSynced(recordId);
      const syncedStats = await getQueueStats();
      this.notify({
        type: "SYNC_COMPLETED",
        recordId,
        stats: syncedStats,
        timestamp: Date.now(),
      });

      console.log(`[SyncManager] Report ${recordId} successfully synced!`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Sync transport connection failed";
      console.warn(`[SyncManager] Report ${recordId} sync failed:`, errorMsg);

      // Mark record as FAILED with incremented attempt count
      await markReportFailed(recordId, errorMsg);
      const failedStats = await getQueueStats();
      this.notify({
        type: "SYNC_FAILED",
        recordId,
        stats: failedStats,
        timestamp: Date.now(),
      });

      // Schedule exponential backoff retry if attempts < maxRetries
      const attempts = (record.syncAttempts || 0) + 1;
      if (attempts < this.maxRetries) {
        this.scheduleRetry(attempts);
      }
    }
  }

  /**
   * Schedule automatic retry with capped exponential backoff + jitter
   */
  private scheduleRetry(attempt: number): void {
    const backoff = Math.min(
      this.maxBackoffMs,
      this.baseBackoffMs * Math.pow(2, attempt - 1) + Math.random() * 500
    );

    console.log(
      `[SyncManager] Scheduling retry attempt ${attempt + 1}/${this.maxRetries} in ${Math.round(backoff / 1000)}s`
    );

    const timerId = window.setTimeout(() => {
      this.activeTimers.delete(timerId);
      if (navigator.onLine) {
        this.syncAll(`BACKOFF_RETRY_${attempt}`);
      }
    }, backoff);

    this.activeTimers.add(timerId);
  }

  /**
   * Clear any active retry timeouts on teardown
   */
  public destroy(): void {
    this.abortController?.abort();
    this.activeTimers.forEach((timerId) => clearTimeout(timerId));
    this.activeTimers.clear();
    this.listeners.clear();
  }
}

export const syncManager = SyncManager.getInstance();

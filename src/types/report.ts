import type { Advisory, HazardContext } from "./intelligence";

export type ReportSyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

export interface ReportRecord {
  id: string; // crypto.randomUUID() — generated client-side, used as the idempotency key on sync
  createdAt: number; // timestamp in milliseconds
  context: HazardContext; // from the intelligence subsystem, unmodified
  advisory: Advisory; // from the intelligence subsystem, unmodified
  photoBlob: Blob; // evidence photo — normalized frame produced for classification
  syncStatus: ReportSyncStatus;
  syncAttempts: number;
  lastSyncError?: string;
  syncedAt?: number;
}

export interface QueueStats {
  pendingCount: number;
  syncingCount: number;
  syncedCount: number;
  failedCount: number;
  totalCount: number;
}

export type QueueEventType =
  | "ENQUEUED"
  | "SYNC_STARTED"
  | "SYNC_COMPLETED"
  | "SYNC_FAILED"
  | "PRUNED"
  | "RESET";

export interface QueueEvent {
  type: QueueEventType;
  recordId?: string;
  record?: ReportRecord;
  stats: QueueStats;
  timestamp: number;
}

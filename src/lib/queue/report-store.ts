import { getReportsDB, STORE_NAME } from "./db";
import type { QueueStats, ReportRecord, ReportSyncStatus } from "@/types/report";

/**
 * Enqueue a newly generated hazard report into IndexedDB.
 * Status is initialized to PENDING with 0 sync attempts.
 */
export async function enqueueReport(record: ReportRecord): Promise<void> {
  const db = await getReportsDB();
  await db.put(STORE_NAME, {
    ...record,
    syncStatus: "PENDING",
    syncAttempts: 0,
  });
}

/**
 * List reports filtered by sync status using the secondary index.
 */
export async function listReportsByStatus(
  status: ReportSyncStatus
): Promise<ReportRecord[]> {
  const db = await getReportsDB();
  return db.getAllFromIndex(STORE_NAME, "by-syncStatus", status);
}

/**
 * Retrieve a single report by its ID.
 */
export async function getReportById(
  id: string
): Promise<ReportRecord | undefined> {
  const db = await getReportsDB();
  return db.get(STORE_NAME, id);
}

/**
 * List all reports sorted newest first.
 */
export async function listAllReports(): Promise<ReportRecord[]> {
  const db = await getReportsDB();
  const all = await db.getAll(STORE_NAME);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Transition record status to SYNCING when sync transport picks it up.
 */
export async function markReportSyncing(id: string): Promise<void> {
  const db = await getReportsDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const record = await store.get(id);
  if (!record) {
    await tx.done;
    return;
  }

  record.syncStatus = "SYNCING";
  await store.put(record);
  await tx.done;
}

/**
 * Mark a report as successfully synced to the backend transport.
 */
export async function markReportSynced(
  id: string,
  syncedAt = Date.now()
): Promise<void> {
  const db = await getReportsDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const record = await store.get(id);
  if (!record) {
    await tx.done;
    return;
  }

  record.syncStatus = "SYNCED";
  record.syncedAt = syncedAt;
  record.lastSyncError = undefined;
  await store.put(record);
  await tx.done;
}

/**
 * Mark a report as failed, incrementing sync attempts and recording error message.
 */
export async function markReportFailed(
  id: string,
  error: string
): Promise<void> {
  const db = await getReportsDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const record = await store.get(id);
  if (!record) {
    await tx.done;
    return;
  }

  record.syncStatus = "FAILED";
  record.syncAttempts = (record.syncAttempts || 0) + 1;
  record.lastSyncError = error;
  await store.put(record);
  await tx.done;
}

/**
 * Manually reset a failed record back to PENDING for immediate retry.
 */
export async function resetReportForRetry(id: string): Promise<void> {
  const db = await getReportsDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const record = await store.get(id);
  if (!record) {
    await tx.done;
    return;
  }

  record.syncStatus = "PENDING";
  record.lastSyncError = undefined;
  await store.put(record);
  await tx.done;
}

/**
 * Delete a report completely by ID.
 */
export async function deleteReport(id: string): Promise<void> {
  const db = await getReportsDB();
  await db.delete(STORE_NAME, id);
}

/**
 * Guard against unbounded storage growth: prune SYNCED records older than threshold (default 7 days).
 */
export async function pruneSyncedReports(
  olderThanMs = 7 * 24 * 60 * 60 * 1000
): Promise<number> {
  const db = await getReportsDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const syncedRecords = await store.index("by-syncStatus").getAll("SYNCED");

  const cutoff = Date.now() - olderThanMs;
  let prunedCount = 0;

  for (const record of syncedRecords) {
    if (record.syncedAt && record.syncedAt < cutoff) {
      await store.delete(record.id);
      prunedCount++;
    }
  }

  await tx.done;
  return prunedCount;
}

/**
 * Calculate instantaneous queue stats across all states.
 */
export async function getQueueStats(): Promise<QueueStats> {
  const db = await getReportsDB();
  const all = await db.getAll(STORE_NAME);

  const stats: QueueStats = {
    pendingCount: 0,
    syncingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    totalCount: all.length,
  };

  for (const record of all) {
    switch (record.syncStatus) {
      case "PENDING":
        stats.pendingCount++;
        break;
      case "SYNCING":
        stats.syncingCount++;
        break;
      case "SYNCED":
        stats.syncedCount++;
        break;
      case "FAILED":
        stats.failedCount++;
        break;
    }
  }

  return stats;
}

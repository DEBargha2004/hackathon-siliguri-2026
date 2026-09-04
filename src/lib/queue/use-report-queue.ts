import { useCallback, useEffect, useState } from "react";
import type { Advisory, HazardContext } from "@/types/intelligence";
import type { QueueStats, ReportRecord } from "@/types/report";
import {
  deleteReport,
  getQueueStats,
  listAllReports,
  pruneSyncedReports,
  resetReportForRetry,
  enqueueReport,
} from "./report-store";
import { syncManager } from "./sync-manager";
import { MockSyncTransport } from "./sync-transport";

export function useReportQueue() {
  const [stats, setStats] = useState<QueueStats>({
    pendingCount: 0,
    syncingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    totalCount: 0,
  });
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSimulatedDrop, setIsSimulatedDrop] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    try {
      const [nextStats, nextReports] = await Promise.all([
        getQueueStats(),
        listAllReports(),
      ]);
      setStats(nextStats);
      setReports(nextReports);
      setIsSyncing(nextStats.syncingCount > 0);
    } catch (err) {
      console.error("[useReportQueue] Failed to load queue state:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      refresh();
    }, 0);

    // Subscribe to queue changes
    const unsubscribe = syncManager.subscribe(() => {
      refresh();
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [refresh]);

  const enqueue = useCallback(
    async (
      context: HazardContext,
      advisory: Advisory,
      photoBlob: Blob
    ): Promise<string> => {
      const recordId = crypto.randomUUID();
      const record: ReportRecord = {
        id: recordId,
        createdAt: Date.now(),
        context,
        advisory,
        photoBlob,
        syncStatus: "PENDING",
        syncAttempts: 0,
      };

      await enqueueReport(record);

      // Register Chromium Background Sync (if supported)
      await syncManager.requestBackgroundSync();

      await refresh();

      // Trigger sync immediately if online
      if (navigator.onLine) {
        syncManager.syncAll("ENQUEUED");
      }

      return recordId;
    },
    [refresh]
  );

  const triggerSync = useCallback(async () => {
    await syncManager.syncAll("MANUAL_TRIGGER");
    await refresh();
  }, [refresh]);

  const retrySingle = useCallback(
    async (id: string) => {
      await resetReportForRetry(id);
      await refresh();
      if (navigator.onLine) {
        await syncManager.syncAll("MANUAL_RETRY");
      }
    },
    [refresh]
  );

  const removeSingle = useCallback(
    async (id: string) => {
      await deleteReport(id);
      await refresh();
    },
    [refresh]
  );

  const pruneOld = useCallback(
    async (olderThanMs?: number) => {
      const count = await pruneSyncedReports(olderThanMs);
      await refresh();
      return count;
    },
    [refresh]
  );

  const toggleSimulatedDrop = useCallback((drop: boolean) => {
    setIsSimulatedDrop(drop);
    const transport = syncManager.getTransport();
    if (transport instanceof MockSyncTransport) {
      transport.forceFail = drop;
    } else {
      const mock = new MockSyncTransport({ forceFail: drop, delayMs: 400 });
      syncManager.setTransport(mock);
    }
  }, []);

  return {
    stats,
    reports,
    isLoading,
    isSyncing,
    isSimulatedDrop,
    enqueue,
    triggerSync,
    retrySingle,
    removeSingle,
    pruneOld,
    toggleSimulatedDrop,
    refresh,
  };
}

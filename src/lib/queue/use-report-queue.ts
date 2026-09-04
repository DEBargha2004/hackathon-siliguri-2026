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
import {
  MockSyncTransport,
  SupabaseSyncTransport,
  HttpSyncTransport,
} from "./sync-transport";
import {
  getSupabase,
  getSupabaseCredentials,
  isSupabaseConfigured,
  setSupabaseCustomCredentials,
} from "@/lib/supabase/client";

interface SupabaseHazardRow {
  id: string;
  created_at: string;
  synced_at?: string;
  hazard_type: string;
  severity: string;
  vision_confidence?: number;
  landmark_label?: string;
  photo_url?: string;
}

interface GatewayReportRow {
  id: string;
  createdAt: number;
  syncedAt?: number;
  hazardType: string;
  severity: string;
  visionConfidence?: number;
  proximityLandmark?: string;
  photoUrl?: string;
  receipt?: string;
}

export interface RemoteReportItem {
  id: string;
  createdAt: number | string;
  syncedAt?: number | string;
  hazardType: string;
  severity: string;
  visionConfidence?: number;
  landmarkLabel?: string;
  photoUrl: string;
  receipt?: string;
  source: "Supabase" | "Gateway";
}

export interface GatewayStatus {
  connected: boolean;
  provider: "Supabase" | "Local Gateway" | "Simulated Sandbox";
  message: string;
}

export function useReportQueue() {
  const [stats, setStats] = useState<QueueStats>({
    pendingCount: 0,
    syncingCount: 0,
    syncedCount: 0,
    failedCount: 0,
    totalCount: 0,
  });
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [remoteReports, setRemoteReports] = useState<RemoteReportItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingRemote, setIsLoadingRemote] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSimulatedDrop, setIsSimulatedDrop] = useState<boolean>(false);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({
    connected: true,
    provider: isSupabaseConfigured() ? "Supabase" : "Local Gateway",
    message: "Initializing...",
  });

  const refreshLocal = useCallback(async () => {
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

  const refreshRemote = useCallback(async () => {
    setIsLoadingRemote(true);
    try {
      const supabase = getSupabase();
      if (supabase && isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from("hazard_reports")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);


        if (!error && data) {
          const mapped: RemoteReportItem[] = (data as unknown as SupabaseHazardRow[]).map((row) => ({
            id: row.id,
            createdAt: row.created_at,
            syncedAt: row.synced_at,
            hazardType: row.hazard_type,
            severity: row.severity,
            visionConfidence: row.vision_confidence,
            landmarkLabel: row.landmark_label,
            photoUrl: row.photo_url || "",
            receipt: `SUPA-${row.id.slice(0, 8).toUpperCase()}`,
            source: "Supabase",
          }));
          setRemoteReports(mapped);
          return;
        }
      }

      // Fallback to local server API
      const res = await fetch("/api/reports", { method: "GET" });
      if (res.ok) {
        const data = (await res.json()) as GatewayReportRow[];
        const mapped: RemoteReportItem[] = (data || []).map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          syncedAt: row.syncedAt,
          hazardType: row.hazardType,
          severity: row.severity,
          visionConfidence: row.visionConfidence,
          landmarkLabel: row.proximityLandmark,
          photoUrl: row.photoUrl || `/api/reports/${row.id}/photo`,
          receipt: row.receipt,
          source: "Gateway",
        }));
        setRemoteReports(mapped);
      }
    } catch (err) {
      console.warn("[useReportQueue] Failed to fetch remote reports:", err);
    } finally {
      setIsLoadingRemote(false);
    }
  }, []);

  const checkHealth = useCallback(async () => {
    const transport = syncManager.getTransport();
    if (transport instanceof MockSyncTransport) {
      setGatewayStatus({
        connected: !transport.forceFail,
        provider: "Simulated Sandbox",
        message: transport.forceFail ? "Weak Signal Drop Simulated" : "Sandbox Ready",
      });
      return;
    }

    if (isSupabaseConfigured()) {
      const supaTransport = new SupabaseSyncTransport();
      const health = await supaTransport.checkHealth();
      setGatewayStatus({
        connected: health.ok,
        provider: "Supabase",
        message: health.message,
      });
      return;
    }

    // Check local Vite gateway
    const httpTransport = new HttpSyncTransport();
    const health = await httpTransport.checkHealth();
    setGatewayStatus({
      connected: health.ok,
      provider: "Local Gateway",
      message: health.message,
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshLocal();
      refreshRemote();
      checkHealth();
    }, 0);

    // Subscribe to queue changes
    const unsubscribe = syncManager.subscribe(() => {
      refreshLocal();
      refreshRemote();
    });

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [refreshLocal, refreshRemote, checkHealth]);

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

      await refreshLocal();

      // Trigger sync immediately if online
      if (navigator.onLine) {
        syncManager.syncAll("ENQUEUED");
      }

      return recordId;
    },
    [refreshLocal]
  );

  const triggerSync = useCallback(async () => {
    await syncManager.syncAll("MANUAL_TRIGGER");
    await refreshLocal();
    await refreshRemote();
  }, [refreshLocal, refreshRemote]);

  const retrySingle = useCallback(
    async (id: string) => {
      await resetReportForRetry(id);
      await refreshLocal();
      if (navigator.onLine) {
        await syncManager.syncAll("MANUAL_RETRY");
      }
    },
    [refreshLocal]
  );

  const removeSingle = useCallback(
    async (id: string) => {
      await deleteReport(id);
      await refreshLocal();
    },
    [refreshLocal]
  );

  const pruneOld = useCallback(
    async (olderThanMs?: number) => {
      const count = await pruneSyncedReports(olderThanMs);
      await refreshLocal();
      return count;
    },
    [refreshLocal]
  );

  const toggleSimulatedDrop = useCallback((drop: boolean) => {
    setIsSimulatedDrop(drop);
    if (drop) {
      const mock = new MockSyncTransport({ forceFail: true, delayMs: 400 });
      syncManager.setTransport(mock);
    } else {
      syncManager.refreshTransport();
    }
    checkHealth();
  }, [checkHealth]);

  const saveSupabaseCredentials = useCallback(
    (url: string, anonKey: string) => {
      setSupabaseCustomCredentials(url, anonKey);
      syncManager.refreshTransport();
      checkHealth();
      refreshRemote();
    },
    [checkHealth, refreshRemote]
  );

  const clearGatewayReports = useCallback(async () => {
    try {
      await fetch("/api/reports", { method: "DELETE" });
      refreshRemote();
    } catch (err) {
      void err;
    }
  }, [refreshRemote]);

  return {
    stats,
    reports,
    remoteReports,
    isLoading,
    isLoadingRemote,
    isSyncing,
    isSimulatedDrop,
    gatewayStatus,
    enqueue,
    triggerSync,
    retrySingle,
    removeSingle,
    pruneOld,
    toggleSimulatedDrop,
    saveSupabaseCredentials,
    getSupabaseCredentials,
    clearGatewayReports,
    refresh: refreshLocal,
    refreshRemote,
    checkHealth,
  };
}

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Clock,
  Database,
  ExternalLink,
  Radio,
  RefreshCw,
  Server,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportRecord } from "@/types/report";
import { useReportQueue, type RemoteReportItem } from "@/lib/queue/use-report-queue";

export interface ReportQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReportQueueDrawer: React.FC<ReportQueueDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    stats,
    reports,
    remoteReports,
    isLoadingRemote,
    isSyncing,
    isSimulatedDrop,
    gatewayStatus,
    triggerSync,
    retrySingle,
    removeSingle,
    pruneOld,
    toggleSimulatedDrop,
    saveSupabaseCredentials,
    getSupabaseCredentials,
    refreshRemote,
    clearGatewayReports,
  } = useReportQueue();

  const [activeTab, setActiveTab] = useState<"outbox" | "cloud">("outbox");
  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [supaUrl, setSupaUrl] = useState<string>(() => getSupabaseCredentials().url);
  const [supaKey, setSupaKey] = useState<string>(() => getSupabaseCredentials().anonKey);
  const [configSuccess, setConfigSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        refreshRemote();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, refreshRemote]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseCredentials(supaUrl, supaKey);
    setConfigSuccess(true);
    setTimeout(() => {
      setConfigSuccess(false);
      setShowConfig(false);
    }, 1200);
  };

  const handleResetToGateway = () => {
    setSupaUrl("");
    setSupaKey("");
    saveSupabaseCredentials("", "");
    setConfigSuccess(true);
    setTimeout(() => {
      setConfigSuccess(false);
      setShowConfig(false);
    }, 800);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative flex flex-col w-full max-w-lg max-h-[90vh] rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {gatewayStatus.provider === "Supabase" ? (
                <Database className="h-4 w-4" />
              ) : (
                <Cloud className="h-4 w-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold leading-tight">
                  Emergency Sync & Dispatch
                </h2>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    gatewayStatus.connected
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      gatewayStatus.connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                    }`}
                  />
                  {gatewayStatus.provider} {gatewayStatus.connected ? "Active" : "Offline"}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground block truncate max-w-[280px]">
                {gatewayStatus.message}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`rounded-lg p-1.5 transition-colors ${
                showConfig
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title="Configure Backend Credentials"
            >
              <Settings className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Configuration Drawer / Popover */}
        {showConfig && (
          <form
            onSubmit={handleSaveConfig}
            className="p-3.5 bg-muted/40 border-b border-border text-xs space-y-2.5 animate-in slide-in-from-top duration-150"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5 text-foreground">
                <Database className="h-3.5 w-3.5 text-emerald-500" />
                Supabase Backend Setup
              </span>
              <button
                type="button"
                onClick={handleResetToGateway}
                className="text-[10px] text-muted-foreground underline hover:text-foreground"
              >
                Use Local Gateway
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Connect directly to your Supabase project for cloud PostgreSQL records & S3 bucket photo storage.
              Run <code className="bg-muted px-1 rounded">supabase/schema.sql</code> in your SQL Editor first.
            </p>

            <div className="space-y-1.5">
              <input
                type="text"
                placeholder="VITE_SUPABASE_URL (e.g. https://xyz.supabase.co)"
                value={supaUrl}
                onChange={(e) => setSupaUrl(e.target.value)}
                className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="password"
                placeholder="VITE_SUPABASE_ANON_KEY"
                value={supaKey}
                onChange={(e) => setSupaKey(e.target.value)}
                className="w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                {configSuccess && "Credentials updated successfully!"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowConfig(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Save & Connect
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* Tab Selection */}
        <div className="flex border-b border-border bg-muted/10 text-xs">
          <button
            onClick={() => setActiveTab("outbox")}
            className={`flex-1 py-2 font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === "outbox"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Cloud className="h-3.5 w-3.5" />
            <span>Device Outbox ({stats.totalCount})</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("cloud");
              refreshRemote();
            }}
            className={`flex-1 py-2 font-bold border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === "cloud"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>Cloud Ingested Feed ({remoteReports.length})</span>
          </button>
        </div>

        {/* TAB 1: DEVICE OUTBOX */}
        {activeTab === "outbox" && (
          <>
            {/* Status Metrics Bar */}
            <div className="grid grid-cols-4 gap-1.5 p-2.5 border-b border-border/60 bg-background/50 text-center">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-1.5">
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 block">
                  Pending
                </span>
                <span className="text-base font-extrabold text-amber-700 dark:text-amber-300">
                  {stats.pendingCount}
                </span>
              </div>
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-1.5">
                <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 block">
                  Syncing
                </span>
                <span className="text-base font-extrabold text-sky-700 dark:text-sky-300 flex items-center justify-center gap-1">
                  {isSyncing && <RefreshCw className="h-3 w-3 animate-spin" />}
                  {stats.syncingCount}
                </span>
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5">
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 block">
                  Synced
                </span>
                <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-300">
                  {stats.syncedCount}
                </span>
              </div>
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5">
                <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 block">
                  Failed
                </span>
                <span className="text-base font-extrabold text-rose-700 dark:text-rose-300">
                  {stats.failedCount}
                </span>
              </div>
            </div>

            {/* Outbox Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/20 text-xs">
              <div className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  Drop Simulator:
                </span>
                <button
                  onClick={() => toggleSimulatedDrop(!isSimulatedDrop)}
                  className={`text-[10px] px-2 py-0.5 rounded font-bold border transition-colors ${
                    isSimulatedDrop
                      ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30"
                      : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                  }`}
                >
                  {isSimulatedDrop ? "Weak Mountain Drop (Fail)" : "Real Live Uplink"}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {stats.syncedCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => pruneOld(0)}
                  >
                    Prune Synced
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSyncing || (stats.pendingCount === 0 && stats.failedCount === 0)}
                  onClick={triggerSync}
                  className="h-7 text-[11px] gap-1 px-2.5 font-semibold"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
                  <span>Flush Queue</span>
                </Button>
              </div>
            </div>

            {/* Outbox Report List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {reports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                  <CloudOff className="h-8 w-8 stroke-1" />
                  <p className="text-xs font-semibold">Local queue is empty</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs">
                    Classified hazard reports are queued in IndexedDB and automatically transmitted to {gatewayStatus.provider} upon reconnect.
                  </p>
                </div>
              ) : (
                reports.map((report) => (
                  <ReportRowItem
                    key={report.id}
                    report={report}
                    onRetry={() => retrySingle(report.id)}
                    onDelete={() => removeSingle(report.id)}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* TAB 2: CLOUD INGESTED FEED */}
        {activeTab === "cloud" && (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20 text-xs">
              <span className="text-[11px] text-muted-foreground">
                Feed from <strong>{gatewayStatus.provider}</strong> ({remoteReports.length} records)
              </span>
              <div className="flex items-center gap-2">
                {gatewayStatus.provider === "Local Gateway" && remoteReports.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] px-2 text-muted-foreground hover:text-destructive"
                    onClick={clearGatewayReports}
                  >
                    Clear Gateway
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isLoadingRemote}
                  onClick={refreshRemote}
                  className="h-7 text-[11px] gap-1 px-2.5 font-semibold"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingRemote ? "animate-spin" : ""}`} />
                  <span>Refresh Feed</span>
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {remoteReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                  <Server className="h-8 w-8 stroke-1 text-muted-foreground/60" />
                  <p className="text-xs font-semibold">No remote reports ingested yet</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs">
                    When hazards are analyzed and synced, the central dispatch records and evidence photo blobs will appear here live.
                  </p>
                </div>
              ) : (
                remoteReports.map((item) => (
                  <RemoteReportRowItem key={item.id} item={item} />
                ))
              )}
            </div>
          </>
        )}

        {/* Footer info */}
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground bg-muted/10 flex items-center justify-between">
          <span>Idempotent Key: UUIDv4</span>
          <span>Target: {gatewayStatus.provider}</span>
        </div>
      </div>
    </div>
  );
};

interface ReportRowItemProps {
  report: ReportRecord;
  onRetry: () => void;
  onDelete: () => void;
}

const ReportRowItem: React.FC<ReportRowItemProps> = ({
  report,
  onRetry,
  onDelete,
}) => {
  const thumbUrl = React.useMemo(() => {
    if (!report.photoBlob) return null;
    return URL.createObjectURL(report.photoBlob);
  }, [report.photoBlob]);

  useEffect(() => {
    return () => {
      if (thumbUrl) {
        URL.revokeObjectURL(thumbUrl);
      }
    };
  }, [thumbUrl]);

  const timeAgo = formatTimeAgo(report.createdAt);

  return (
    <div className="rounded-xl border border-border/80 bg-background/70 p-2.5 shadow-xs hover:border-border transition-all flex gap-3 items-center">
      {/* Thumbnail */}
      <div className="h-12 w-12 rounded-lg bg-muted border border-border/50 overflow-hidden shrink-0 flex items-center justify-center">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt="Evidence frame"
            className="h-full w-full object-cover"
          />
        ) : (
          <Cloud className="h-5 w-5 text-muted-foreground/50" />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <h4 className="text-xs font-bold text-foreground truncate">
            {report.advisory?.hazardLabel || report.context?.hazardType || "Hazard Report"}
          </h4>
          <SyncStatusBadge
            status={report.syncStatus}
            attempts={report.syncAttempts}
          />
        </div>

        <p className="text-[11px] text-muted-foreground truncate">
          {report.context?.proximityLandmark?.label || "Corridor GPS Telemetry Attached"}
        </p>

        {report.lastSyncError && (
          <p className="text-[10px] text-rose-500 font-medium truncate mt-0.5">
            Error: {report.lastSyncError}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo}
          </span>
          <span>•</span>
          <span className="font-mono text-[9px]">ID: {report.id.slice(0, 8)}...</span>
        </div>
      </div>

      {/* Row Actions */}
      <div className="flex flex-col gap-1 shrink-0">
        {report.syncStatus === "FAILED" && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] font-bold border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
            onClick={onRetry}
          >
            Retry
          </Button>
        )}
        <button
          onClick={onDelete}
          className="p-1 text-muted-foreground/60 hover:text-destructive rounded transition-colors self-end"
          title="Delete report from queue"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};

const RemoteReportRowItem: React.FC<{ item: RemoteReportItem }> = ({ item }) => {
  const timeAgo = formatTimeAgo(
    typeof item.createdAt === "string" ? new Date(item.createdAt).getTime() : item.createdAt
  );

  return (
    <div className="rounded-xl border border-border/80 bg-background/70 p-2.5 shadow-xs hover:border-border transition-all flex gap-3 items-center">
      {/* Photo from Cloud / Server */}
      <div className="h-12 w-12 rounded-lg bg-muted border border-border/50 overflow-hidden shrink-0 flex items-center justify-center">
        {item.photoUrl ? (
          <img
            src={item.photoUrl}
            alt="Ingested hazard"
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
        ) : (
          <Database className="h-5 w-5 text-muted-foreground/50" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <h4 className="text-xs font-bold text-foreground truncate">
            {item.hazardType}
          </h4>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            <CheckCircle2 className="h-2.5 w-2.5" />
            Ingested
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground truncate">
          {item.landmarkLabel || "Railway Track Sector"}
        </p>

        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {timeAgo}
          </span>
          <span>•</span>
          <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">
            {item.receipt || item.id.slice(0, 8)}
          </span>
          <span>•</span>
          <span className="text-[9px] px-1 rounded bg-muted font-medium">
            {item.source}
          </span>
        </div>
      </div>

      {item.photoUrl && (
        <a
          href={item.photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors shrink-0"
          title="View Original Evidence Photo"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
};

const SyncStatusBadge: React.FC<{
  status: ReportRecord["syncStatus"];
  attempts: number;
}> = ({ status, attempts }) => {
  switch (status) {
    case "PENDING":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
          <Clock className="h-2.5 w-2.5" />
          Pending
        </span>
      );
    case "SYNCING":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
          <RefreshCw className="h-2.5 w-2.5 animate-spin" />
          Syncing
        </span>
      );
    case "SYNCED":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Synced
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">
          <AlertCircle className="h-2.5 w-2.5" />
          Failed ({attempts})
        </span>
      );
  }
};

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(minutes / 24);
  return `${days}d ago`;
}

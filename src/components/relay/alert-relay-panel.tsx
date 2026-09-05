import React, { useState, useEffect, useCallback } from "react";
import {
  Radio,
  Wifi,
  WifiOff,
  RefreshCw,
  Share2,
  Inbox,
  AlertTriangle,
  Clock,
  MapPin,
  Trash2,
  ShieldAlert,
  Mountain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OfficialAlert } from "@/types/alert";
import {
  listOfficialAlerts,
  deleteOfficialAlert,
  canRelayAlert,
  MAX_HOP_COUNT,
  importReportsFromLocalQueue,
  clearAllOfficialAlerts,
} from "@/lib/relay/alert-store";
import {
  syncOfficialAlerts,
  subscribeToOfficialAlerts,
} from "@/lib/relay/alert-ingestion";
import { HostRelayDialog } from "./host-relay-dialog";
import { ReceiverRelayDialog } from "./receiver-relay-dialog";
import { AlertPhotoThumbnail } from "./alert-photo-thumbnail";
import { SelectCachedReportModal } from "./select-cached-report-modal";

export interface AlertRelayPanelProps {
  onNavigateToAnalyzer?: () => void;
}

export const AlertRelayPanel: React.FC<AlertRelayPanelProps> = ({
  onNavigateToAnalyzer,
}) => {
  const [alerts, setAlerts] = useState<OfficialAlert[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [isSelectReportsOpen, setIsSelectReportsOpen] = useState<boolean>(false);

  const [selectedAlertForHost, setSelectedAlertForHost] = useState<OfficialAlert | null>(null);
  const [isReceiverOpen, setIsReceiverOpen] = useState<boolean>(false);

  // Directly load and sync from cached reports into relay alerts
  const reloadAlerts = useCallback(async () => {
    try {
      await importReportsFromLocalQueue();
    } catch {
      // ignore
    }
    const list = await listOfficialAlerts();
    setAlerts(list);
  }, []);

  // Online / offline event listener & initial load
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    reloadAlerts();

    // Subscribe to realtime updates if Supabase is configured
    const unsubscribe = subscribeToOfficialAlerts(() => {
      reloadAlerts();
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribe();
    };
  }, [reloadAlerts]);

  // Handle Manual Supabase Sync
  const handleSyncSupabase = async () => {
    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      const res = await syncOfficialAlerts();
      if (res.error) {
        setSyncStatusMsg(`Sync note: ${res.error}`);
      } else {
        setSyncStatusMsg(
          res.ingestedCount > 0
            ? `Received ${res.ingestedCount} new corridor alert(s)`
            : "Corridor alerts are up to date."
        );
      }
      await reloadAlerts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync error";
      setSyncStatusMsg(msg);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    }
  };

  // Handle deleting an alert
  const handleDelete = async (id: string) => {
    await deleteOfficialAlert(id);
    await reloadAlerts();
  };

  // Open Host Relay directly or open cached reports picker
  const handleTopShare = () => {
    if (alerts.length === 1) {
      setSelectedAlertForHost(alerts[0]);
    } else {
      setIsSelectReportsOpen(true);
    }
  };

  // Clear all cached alerts
  const handleClearAll = async () => {
    await clearAllOfficialAlerts();
    await reloadAlerts();
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
      case "WARNING":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
      case "MONITOR":
      default:
        return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 pb-12">
      {/* Top Banner & Actions */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <Radio className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Corridor Relay
              </h2>
              {/* Online/Offline Status Pill */}
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  isOnline
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {isOnline ? (
                  <>
                    <Wifi className="h-2.5 w-2.5" /> Online
                  </>
                ) : (
                  <>
                    <WifiOff className="h-2.5 w-2.5" /> Offline Hotspot
                  </>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Send hazard alerts and evidence photos directly to nearby phones without internet or cellular connection.
            </p>
          </div>

          {/* Clean Top Actions */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              size="sm"
              onClick={handleTopShare}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs gap-1.5 shadow-sm h-9"
              title="Share a cached hazard alert with nearby phones"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share Alert
            </Button>

            <Button
              size="sm"
              onClick={() => setIsReceiverOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs gap-1.5 shadow-sm h-9"
            >
              <Inbox className="h-3.5 w-3.5" />
              Receive Alert
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={isSyncing}
              onClick={handleSyncSupabase}
              className="rounded-xl text-xs gap-1.5 h-9"
              title="Sync alerts from server when online"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              Sync
            </Button>
          </div>
        </div>

        {/* Sync status toast */}
        {syncStatusMsg && (
          <div className="p-2.5 rounded-xl bg-muted text-[11px] text-muted-foreground flex items-center justify-between">
            <span>{syncStatusMsg}</span>
          </div>
        )}
      </div>

      {/* Alerts Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Hazard Alerts Ready to Relay ({alerts.length})
          </h3>

          {alerts.length > 0 && (
            <Button
              size="xs"
              variant="ghost"
              onClick={handleClearAll}
              className="text-[10px] text-muted-foreground hover:text-destructive h-7 px-1.5"
              title="Dismiss all cached alerts"
            >
              Clear All
            </Button>
          )}
        </div>

        {/* Empty State */}
        {alerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                No Hazard Alerts in Cache
              </h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                Analyze a slope hazard in the Hazard Analyzer to cache it for relay, or receive an alert from a nearby phone.
              </p>
            </div>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={handleTopShare}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs gap-1.5 font-bold shadow-sm"
              >
                <Share2 className="h-3.5 w-3.5" />
                Share from Cache
              </Button>

              {onNavigateToAnalyzer && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onNavigateToAnalyzer}
                  className="rounded-xl text-xs gap-1.5 font-semibold shadow-sm"
                >
                  <Mountain className="h-3.5 w-3.5" />
                  Analyze New Hazard
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsReceiverOpen(true)}
                className="rounded-xl text-xs gap-1.5"
              >
                <Inbox className="h-3.5 w-3.5" />
                Receive from Nearby Phone
              </Button>
            </div>
          </div>
        ) : (
          /* Alert Cards List */
          <div className="space-y-3">
            {alerts.map((alert) => {
              const hopCheck = canRelayAlert(alert);
              const isCapReached = !hopCheck.allowed;

              // Clean message display: strip any legacy appended [Location: ...] tag
              const cleanMessage = alert.message.replace(/\s*\[Location:.*?\]\s*$/, "");

              // Clean location display: prefer locationName, then fallback to coords if available
              const displayLocation =
                alert.locationName ||
                (alert.coordinates
                  ? `${alert.coordinates[0].toFixed(3)}°N, ${alert.coordinates[1].toFixed(3)}°E`
                  : null);

              return (
                <div
                  key={alert.id}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex flex-col sm:flex-row">
                    {/* Evidence Photo Thumbnail */}
                    <AlertPhotoThumbnail
                      blob={alert.photoBlob}
                      hazardType={alert.hazardType}
                    />

                    {/* Alert Content Details */}
                    <div className="flex-1 p-4 flex flex-col justify-between space-y-3">
                      <div className="space-y-2">
                        {/* Badges Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${getSeverityBadgeClass(
                                alert.severity
                              )}`}
                            >
                              {alert.severity}
                            </span>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {alert.hazardType.replace(/_/g, " ")}
                            </span>
                          </div>

                          {/* Clean Hop Indicator */}
                          <div className="flex items-center gap-1">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                isCapReached
                                  ? "bg-red-500/10 text-red-600 border-red-500/30"
                                  : alert.hopCount === 0
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                              }`}
                            >
                              {alert.hopCount === 0
                                ? "Local Cache"
                                : `Relayed (${alert.hopCount}/${MAX_HOP_COUNT})`}
                            </span>
                          </div>
                        </div>

                        {/* Advisory Instruction Text */}
                        <p className="text-xs sm:text-sm font-medium text-foreground leading-relaxed">
                          {cleanMessage}
                        </p>

                        {/* Metadata Footer: Clean Location & Time */}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                          {displayLocation && (
                            <span className="flex items-center gap-1 font-medium text-foreground/80">
                              <MapPin className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              {displayLocation}
                            </span>
                          )}

                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(alert.issuedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Card Action Controls */}
                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => handleDelete(alert.id)}
                          className="text-[10px] text-muted-foreground hover:text-destructive h-7 px-2"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Dismiss
                        </Button>

                        <div className="flex items-center gap-2">
                          {isCapReached ? (
                            <span className="text-[10px] font-semibold text-destructive flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Relay Capped ({MAX_HOP_COUNT} hops)
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => setSelectedAlertForHost(alert)}
                              className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs gap-1.5 shadow-sm h-8"
                            >
                              <Share2 className="h-3.5 w-3.5" />
                              Share Alert
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Select Cached Reports to Share Modal */}
      <SelectCachedReportModal
        isOpen={isSelectReportsOpen}
        onClose={() => setIsSelectReportsOpen(false)}
        onAdded={() => reloadAlerts()}
        onShareAlert={(alert) => setSelectedAlertForHost(alert)}
        onNavigateToAnalyzer={onNavigateToAnalyzer}
      />

      {/* Host Relay Modal Dialog */}
      {selectedAlertForHost && (
        <HostRelayDialog
          alert={selectedAlertForHost}
          isOpen={Boolean(selectedAlertForHost)}
          onClose={() => setSelectedAlertForHost(null)}
          onRelayCompleted={() => reloadAlerts()}
        />
      )}

      {/* Receiver Relay Modal Dialog */}
      <ReceiverRelayDialog
        isOpen={isReceiverOpen}
        onClose={() => {
          setIsReceiverOpen(false);
          reloadAlerts();
        }}
        onAlertReceived={() => reloadAlerts()}
      />
    </div>
  );
};


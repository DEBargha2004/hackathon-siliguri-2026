import React, { useState, useEffect } from "react";
import {
  Layers,
  X,
  Clock,
  MapPin,
  CheckSquare,
  Square,
  ArrowRight,
  ShieldAlert,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportRecord } from "@/types/report";
import type { OfficialAlert } from "@/types/alert";
import { listAllReports } from "@/lib/queue/report-store";
import { convertReportsToOfficialAlerts, convertReportToOfficialAlert } from "@/lib/relay/alert-store";
import { AlertPhotoThumbnail } from "./alert-photo-thumbnail";

export interface SelectCachedReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
  onShareAlert?: (alert: OfficialAlert) => void;
  onNavigateToAnalyzer?: () => void;
  onOpenUpload?: () => void;
}

export const SelectCachedReportModal: React.FC<SelectCachedReportModalProps> = ({
  isOpen,
  onClose,
  onAdded,
  onShareAlert,
  onNavigateToAnalyzer,
  onOpenUpload,
}) => {
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    const loadReports = async () => {
      setIsLoading(true);
      try {
        const list = await listAllReports();
        setReports(list);
        // Default select all if small list
        setSelectedIds(new Set(list.map((r) => r.id)));
      } catch (err) {
        console.warn("Failed to load local reports:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadReports();
  }, [isOpen]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === reports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(reports.map((r) => r.id)));
    }
  };

  const handleConfirm = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmitting(true);
    try {
      await convertReportsToOfficialAlerts(Array.from(selectedIds));
      onAdded();
      onClose();
    } catch (err) {
      console.error("Failed to convert selected reports:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectSingle = async (reportId: string) => {
    setIsSubmitting(true);
    try {
      await convertReportsToOfficialAlerts([reportId]);
      onAdded();
      onClose();
    } catch (err) {
      console.error("Failed to convert report:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight">
                Select from Cached Local Events
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Choose hazard reports stored in IndexedDB to promote into relay alerts
              </p>
            </div>
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={onClose}
            className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Action bar if items exist */}
        {reports.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-muted/20 border-b border-border text-xs">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
            >
              {selectedIds.size === reports.length ? (
                <CheckSquare className="h-4 w-4 text-emerald-600" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              <span>
                {selectedIds.size === reports.length ? "Deselect All" : "Select All"} (
                {reports.length})
              </span>
            </button>

            <span className="text-[11px] text-muted-foreground">
              {selectedIds.size} selected
            </span>
          </div>
        )}

        {/* Body list */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Loading local storage reports...
            </div>
          ) : reports.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  No Local Reports in Storage
                </h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto mt-1">
                  You haven't captured or analyzed any slope hazards yet. Use the Hazard Analyzer or upload a photo directly.
                </p>
              </div>
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                {onNavigateToAnalyzer && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onClose();
                      onNavigateToAnalyzer();
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm"
                  >
                    Open Hazard Analyzer
                  </Button>
                )}
                {onOpenUpload && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onOpenUpload();
                    }}
                    className="rounded-xl text-xs"
                  >
                    Upload New Photo
                  </Button>
                )}
              </div>
            </div>
          ) : (
            reports.map((report) => {
              const isSelected = selectedIds.has(report.id);
              const hazardType = report.context.hazardType || "LANDSLIDE_SLIP";
              const severity = report.context.severity || "CRITICAL";
              const locationName =
                report.context.proximityLandmark?.name ||
                report.context.proximityLandmark?.label ||
                "Trackside Corridor";
              const label =
                report.advisory.hazardLabel || report.advisory.immediateAction || "Slope Hazard";

              return (
                <div
                  key={report.id}
                  onClick={() => toggleSelect(report.id)}
                  className={`cursor-pointer rounded-xl border p-3 transition-all flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between ${
                    isSelected
                      ? "border-emerald-500/70 bg-emerald-500/5 shadow-sm"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    {/* Checkbox indicator */}
                    <div className="shrink-0 text-emerald-600">
                      {isSelected ? (
                        <CheckSquare className="h-5 w-5" />
                      ) : (
                        <Square className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* Photo thumbnail */}
                    <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-black/90 border border-border">
                      <AlertPhotoThumbnail
                        blob={report.photoBlob}
                        hazardType={hazardType}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    {/* Details */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-full border ${
                            severity === "CRITICAL"
                              ? "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"
                              : severity === "WARNING"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
                              : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30"
                          }`}
                        >
                          {severity}
                        </span>
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {hazardType.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-foreground truncate">{label}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {locationName}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(report.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Item buttons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectSingle(report.id);
                      }}
                      className="rounded-lg text-[10px] h-7 px-2"
                    >
                      Select
                    </Button>

                    <Button
                      size="xs"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const alert = await convertReportToOfficialAlert(report);
                        onShareAlert?.(alert);
                        onClose();
                      }}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-[10px] h-7 px-2.5 gap-1 shadow-sm"
                    >
                      <Share2 className="h-3 w-3" />
                      Share
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer actions */}
        {reports.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
            <Button size="sm" variant="ghost" onClick={onClose} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSubmitting || selectedIds.size === 0}
              onClick={handleConfirm}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs gap-1.5 shadow-md"
            >
              <span>Add Selected ({selectedIds.size}) to Relay</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

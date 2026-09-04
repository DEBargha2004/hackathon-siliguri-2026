import React from "react";
import { Cloud, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useNetworkStatus } from "@/lib/network/use-network-status";

export interface WizardStepperProps {
  currentStep: 1 | 2 | 3;
  onStepClick: (step: 1 | 2 | 3) => void;
  canAccessStep2: boolean;
  canAccessStep3: boolean;
  lifecycleState?: string;
  loadingProgress?: number;
  loadingStage?: string;
  queuePendingCount?: number;
  queueFailedCount?: number;
  queueSyncedCount?: number;
  isSyncingQueue?: boolean;
  onOpenQueue?: () => void;
}

export const WizardStepper: React.FC<WizardStepperProps> = ({
  currentStep,
  onStepClick,
  canAccessStep2,
  canAccessStep3,
  lifecycleState,
  loadingProgress,
  queuePendingCount = 0,
  queueFailedCount = 0,
  queueSyncedCount = 0,
  isSyncingQueue = false,
  onOpenQueue,
}) => {
  const { isOnline } = useNetworkStatus(3000);

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card/90 px-3 py-2 shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-1 text-xs font-bold">
        <button
          onClick={() => onStepClick(1)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
            currentStep === 1
              ? "bg-primary text-primary-foreground shadow-xs font-extrabold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>1. Capture</span>
        </button>
        <span className="text-muted-foreground">→</span>
        <button
          onClick={() => {
            if (canAccessStep2) onStepClick(2);
          }}
          disabled={!canAccessStep2}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
            currentStep === 2
              ? "bg-primary text-primary-foreground shadow-xs font-extrabold"
              : "text-muted-foreground hover:text-foreground disabled:opacity-35"
          }`}
        >
          <span>2. Confirm</span>
        </button>
        <span className="text-muted-foreground">→</span>
        <button
          onClick={() => {
            if (canAccessStep3) onStepClick(3);
          }}
          disabled={!canAccessStep3}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
            currentStep === 3
              ? "bg-primary text-primary-foreground shadow-xs font-extrabold"
              : "text-muted-foreground hover:text-foreground disabled:opacity-35"
          }`}
        >
          <span>3. Directive</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Queue Status Pill / Trigger */}
        {onOpenQueue && (
          <button
            onClick={onOpenQueue}
            title="Open Report Sync Queue"
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-all hover:scale-105 active:scale-95 ${
              isSyncingQueue
                ? "text-sky-600 dark:text-sky-400 bg-sky-500/10 border-sky-500/20"
                : queueFailedCount > 0
                ? "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20"
                : queuePendingCount > 0
                ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
                : "text-muted-foreground bg-muted/50 border-border hover:text-foreground"
            }`}
          >
            {isSyncingQueue ? (
              <>
                <RefreshCw className="h-2.5 w-2.5 animate-spin text-sky-500" />
                <span>Syncing</span>
              </>
            ) : queueFailedCount > 0 ? (
              <>
                <AlertCircle className="h-2.5 w-2.5 text-rose-500" />
                <span>{queueFailedCount} Failed</span>
              </>
            ) : queuePendingCount > 0 ? (
              <>
                <Cloud className="h-2.5 w-2.5 text-amber-500" />
                <span>{queuePendingCount} Queued</span>
              </>
            ) : queueSyncedCount > 0 ? (
              <>
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                <span>Synced</span>
              </>
            ) : (
              <>
                <Cloud className="h-2.5 w-2.5 opacity-60" />
                <span>Queue</span>
              </>
            )}
          </button>
        )}

        {/* AI Engine Loading Pill (only shown when actively loading weights/engine) */}
        {lifecycleState === "LOADING" && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20"
            title="Initializing on-device AI pipeline"
          >
            <span className="h-2 w-2 rounded-full border-[1.5px] border-primary border-r-transparent animate-spin" />
            AI {loadingProgress ? Math.min(100, Math.max(0, Math.round(loadingProgress))) : 0}%
          </span>
        )}

        {/* Network Connectivity Status Pill (ALWAYS visible) */}
        {isOnline ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20"
            title="Connected to network • Uplink sync active"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Online
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20"
            title="No network connection • On-device AI & local storage active"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Offline
          </span>
        )}
      </div>
    </div>
  );
};

import React from "react";
import { Camera, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HazardAnalysisResult, Locale } from "@/types/intelligence";
import { SeverityBanner } from "../components/severity-banner";
import { FieldCommandCard } from "../components/field-command-card";
import { RelayPriorityCard } from "../components/relay-priority-card";
import { LocaleSelector } from "../components/locale-selector";

import { Cloud } from "lucide-react";

export interface StepDirectiveProps {
  result: HazardAnalysisResult;
  selectedLocale: Locale;
  isProcessing: boolean;
  isSpeaking: boolean;
  onToggleSpeech: (text: string, locale: Locale) => void;
  onSwitchLocale: (locale: Locale) => void;
  onReset: () => void;
  onReAnalyze: () => void;
  onOpenQueue?: () => void;
  queuedReportId?: string | null;
}

export const StepDirective: React.FC<StepDirectiveProps> = ({
  result,
  selectedLocale,
  isProcessing,
  isSpeaking,
  onToggleSpeech,
  onSwitchLocale,
  onReset,
  onReAnalyze,
  onOpenQueue,
  queuedReportId,
}) => {
  const currentAdvisory =
    result.advisoriesByLocale?.[selectedLocale] ?? result.advisory;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-primary/40 bg-card p-4 shadow-xl space-y-3.5 transition-all">
        {/* Severity Banner */}
        <SeverityBanner
          severity={result.context.severity}
          confidence={result.context.visionConfidence}
          landmarkLabel={result.context.proximityLandmark?.label}
        />

        {/* Localized Hazard Title */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Classified Hazard:
          </span>
          <h3 className="text-lg font-extrabold text-foreground leading-snug">
            {currentAdvisory.hazardLabel}
          </h3>
        </div>

        {/* Immediate Action Directive + Audio Listen */}
        <FieldCommandCard
          command={currentAdvisory.immediateAction}
          isSpeaking={isSpeaking}
          onToggleSpeech={() => onToggleSpeech(currentAdvisory.immediateAction, selectedLocale)}
        />

        {/* Relay Priority Card */}
        <RelayPriorityCard priority={currentAdvisory.relayPriority} />

        {/* Offline Persistence & Queue Banner */}
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-foreground text-[11px] block">
                Offline Report Persisted
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Saved to IndexedDB {queuedReportId ? `(${queuedReportId.slice(0, 8)})` : ""} • Auto-flushes on reconnect
              </span>
            </div>
          </div>
          {onOpenQueue && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] font-bold px-2 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
              onClick={onOpenQueue}
            >
              View Queue
            </Button>
          )}
        </div>

        {/* Quick Language Toggle */}
        <div className="pt-2 border-t border-border">
          <LocaleSelector
            value={selectedLocale}
            onChange={onSwitchLocale}
            variant="compact"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          size="lg"
          variant="outline"
          className="flex-1 font-semibold rounded-xl text-xs gap-1.5"
          onClick={onReset}
        >
          <Camera className="h-4 w-4" />
          <span>Report Another Hazard</span>
        </Button>
        <Button
          size="lg"
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs gap-1.5"
          onClick={onReAnalyze}
          disabled={isProcessing}
        >
          <RefreshCw
            className={`h-4 w-4 ${isProcessing ? "animate-spin" : ""}`}
          />
          <span>Re-Analyze</span>
        </Button>
      </div>
    </div>
  );
};

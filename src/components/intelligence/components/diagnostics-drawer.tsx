import React, { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Database, FileCode2, HardDrive, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AdvisoryTier, HazardAnalysisResult } from "@/types/intelligence";
import { FpsCounter } from "../fps-counter";
import type { ModelCacheStats } from "@/lib/cache/model-cache-db";

export interface DiagnosticsDrawerProps {
  activeTier: AdvisoryTier;
  forcedTier: AdvisoryTier | "auto";
  onSelectForcedTier: (tier: AdvisoryTier | "auto") => void;
  memoryHeapMB?: number;
  analysisResult: HazardAnalysisResult | null;
  cacheStats?: ModelCacheStats | null;
  onRefreshCache?: () => void;
  onCopyJson: () => void;
  copiedJson: boolean;
}

const TIER_OPTIONS: readonly (AdvisoryTier | "auto")[] = ["auto", 1, 2, 3] as const;

export const DiagnosticsDrawer: React.FC<DiagnosticsDrawerProps> = ({
  activeTier,
  forcedTier,
  onSelectForcedTier,
  memoryHeapMB,
  analysisResult,
  cacheStats,
  onRefreshCache,
  onCopyJson,
  copiedJson,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  const latencyMetrics = analysisResult
    ? [
        { label: "Vision", valueMs: analysisResult.metrics.visionLatencyMs },
        { label: "Fusion", valueMs: analysisResult.metrics.fusionLatencyMs },
        { label: "LLM", valueMs: analysisResult.metrics.advisoryLatencyMs },
        { label: "Total", valueMs: analysisResult.metrics.totalLatencyMs, isTotal: true },
      ]
    : [];

  return (
    <div className="rounded-xl border border-border bg-card/60 overflow-hidden text-xs mt-6">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 text-muted-foreground hover:text-foreground font-medium transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[11px]">
          <Layers className="h-3.5 w-3.5" />
          Subsystem Diagnostics & Metrics (Internal)
        </span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {isOpen && (
        <div className="p-3 pt-0 space-y-3 border-t border-border/40 bg-muted/20 font-mono text-[11px]">
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <FpsCounter />
            <span className="px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground">
              Tier {activeTier} ({analysisResult?.tierName ?? "Auto"})
            </span>
            <span className="px-2 py-0.5 rounded-full border border-border bg-background text-muted-foreground flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {memoryHeapMB ? `${memoryHeapMB}MB` : "<150MB"} / 1.2GB Guardrail
            </span>
          </div>

          {/* Cascade Tier Override */}
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground font-sans font-semibold">
              Force Cascade Tier:
            </span>
            <div className="grid grid-cols-4 gap-1">
              {TIER_OPTIONS.map((t) => (
                <Button
                  key={t}
                  size="xs"
                  variant={forcedTier === t ? "default" : "outline"}
                  onClick={() => onSelectForcedTier(t)}
                  className="h-6 text-[10px]"
                >
                  {t === "auto" ? "Auto" : `T${t}`}
                </Button>
              ))}
            </div>
          </div>

          {/* Latency Breakdown */}
          {latencyMetrics.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5 text-center pt-1">
              {latencyMetrics.map((m) => (
                <div
                  key={m.label}
                  className={`p-1 rounded border ${
                    m.isTotal
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold"
                      : "bg-background border-border"
                  }`}
                >
                  <span className="block text-[9px] text-muted-foreground font-sans">{m.label}</span>
                  <span>{m.valueMs}ms</span>
                </div>
              ))}
            </div>
          )}

          {/* IndexedDB Model Cache Breakdown */}
          <div className="rounded-lg border border-border/70 bg-background/50 p-2 space-y-1.5 font-sans">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-foreground flex items-center gap-1">
                <Database className="h-3 w-3 text-sky-500" />
                IndexedDB On-Device Neural Cache:
              </span>
              {onRefreshCache && (
                <button
                  onClick={onRefreshCache}
                  className="text-[9px] text-primary hover:underline flex items-center gap-0.5"
                >
                  <RefreshCw className="h-2.5 w-2.5" /> Refresh
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="p-1.5 rounded border border-border/50 bg-card/60">
                <span className="text-muted-foreground block text-[9px]">Vision Model (MobileNetV4)</span>
                <span className="font-mono font-bold text-foreground">
                  {cacheStats ? `${(cacheStats.visionBytes / (1024 * 1024)).toFixed(1)} MB` : "Checking..."}
                </span>
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 ml-1">
                  {cacheStats?.isVisionCached ? "(Cached)" : "(Pending)"}
                </span>
              </div>

              <div className="p-1.5 rounded border border-border/50 bg-card/60">
                <span className="text-muted-foreground block text-[9px]">LLM Engine (Qwen2.5 / Nano)</span>
                <span className="font-mono font-bold text-foreground">
                  {cacheStats ? `${(cacheStats.llmBytes / (1024 * 1024)).toFixed(1)} MB` : "Checking..."}
                </span>
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 ml-1">
                  {cacheStats?.isLlmCached ? "(Cached)" : "(Pending)"}
                </span>
              </div>
            </div>
          </div>

          {/* Raw JSON Inspection */}
          {analysisResult && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-sans font-semibold flex items-center gap-1">
                  <FileCode2 className="h-3 w-3" />
                  Canonical HazardContext JSON:
                </span>
                <button
                  onClick={onCopyJson}
                  className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-sans"
                >
                  <Copy className="h-3 w-3" />
                  {copiedJson ? "Copied!" : "Copy JSON"}
                </button>
              </div>
              <pre className="p-2 rounded bg-background border border-border text-[10px] overflow-x-auto max-h-40">
                {JSON.stringify(analysisResult.context, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

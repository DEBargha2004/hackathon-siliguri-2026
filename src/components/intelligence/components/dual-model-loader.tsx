import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Cpu,
  Database,
  Eye,
  MessageSquareCode,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react";
import type { DualModelStatus } from "../hooks/use-hazard-worker";
import type { ModelCacheStats } from "@/lib/cache/model-cache-db";

export interface DualModelLoaderProps {
  lifecycleState: "UNINITIALIZED" | "LOADING" | "READY" | "PROCESSING" | "ERROR";
  loadingProgress: number;
  loadingStage: string;
  modelStatus: DualModelStatus;
  cacheStats?: ModelCacheStats | null;
  activeProcessingStage?: "vision" | "fusion" | "advisory" | null;
}

export const DualModelLoader: React.FC<DualModelLoaderProps> = ({
  lifecycleState,
  loadingProgress,
  loadingStage,
  modelStatus,
  cacheStats,
  activeProcessingStage,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const isAllReady =
    lifecycleState === "READY" &&
    modelStatus.vision.status === "ready" &&
    modelStatus.llm.status === "ready";

  const isProcessing = lifecycleState === "PROCESSING";
  const isLoading = lifecycleState === "LOADING" || lifecycleState === "UNINITIALIZED";

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="rounded-xl border border-border/80 bg-card/90 shadow-sm backdrop-blur-md overflow-hidden transition-all text-xs">
      {/* Header Button Toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer select-none hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex items-center justify-center h-6 w-6 rounded-lg bg-primary/10 border border-primary/25 text-primary shrink-0">
            {isProcessing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-500" />
            ) : isAllReady ? (
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-foreground text-[11px] tracking-tight">
                Dual On-Device AI Engine
              </span>
              {isAllReady && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/30">
                  <Database className="h-2.5 w-2.5 text-emerald-500" />
                  IndexedDB Cached
                </span>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground truncate max-w-[220px] sm:max-w-[280px]">
              {isProcessing
                ? activeProcessingStage === "vision"
                  ? "Vision Model: Classifying hazard..."
                  : activeProcessingStage === "fusion"
                  ? "Context Fusion: Correlating telemetry..."
                  : "LLM Engine: Generating advisories..."
                : isLoading
                ? loadingStage || "Mounting neural pipelines in IndexedDB..."
                : `Vision (${modelStatus.vision.delegate ?? "Neural"}) + LLM (${modelStatus.llm.tierName ?? "WebGPU/Nano"})`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {isLoading && (
            <span className="text-[10px] font-mono font-bold text-primary px-1.5 py-0.5 bg-primary/10 rounded border border-primary/20">
              {Math.min(100, Math.max(0, Math.round(loadingProgress)))}%
            </span>
          )}
          <span className="text-muted-foreground p-0.5 pointer-events-none">
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
        </div>
      </button>

      {/* Global Progress Bar when Loading or Processing */}
      {(isLoading || isProcessing) && (
        <div className="w-full bg-muted/40 h-1 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              isProcessing
                ? "bg-amber-500 animate-pulse"
                : "bg-linear-to-r from-primary via-emerald-500 to-sky-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(5, loadingProgress))}%` }}
          />
        </div>
      )}

      {/* Expanded Model Details Grid */}
      {isExpanded && (
        <div className="p-3 pt-2 space-y-2.5 border-t border-border/50 bg-card/40">
          {/* Model 1: Vision Classifier (MobileNetV4) */}
          <div className="rounded-lg border border-border/60 bg-background/60 p-2.5 space-y-1.5 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-5 w-5 rounded-md bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400">
                  <Eye className="h-3 w-3" />
                </div>
                <div>
                  <span className="font-bold text-[11px] text-foreground">
                    1. Vision Classifier
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-1">
                    (MobileNetV4 ONNX)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {modelStatus.vision.cachedInIndexedDb ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    <Database className="h-2.5 w-2.5" />
                    IndexedDB ({cacheStats ? formatBytes(cacheStats.visionBytes) : "Cached"})
                  </span>
                ) : modelStatus.vision.status === "loading" ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                    <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded border border-border">
                    <Cpu className="h-2.5 w-2.5" />
                    {modelStatus.vision.delegate ?? "Ready"}
                  </span>
                )}
              </div>
            </div>

            {/* Vision Progress Bar if active */}
            {(modelStatus.vision.status === "loading" || activeProcessingStage === "vision") && (
              <div className="w-full bg-muted/50 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-200"
                  style={{
                    width: `${
                      activeProcessingStage === "vision"
                        ? 75
                        : Math.min(100, Math.max(5, modelStatus.vision.progress))
                    }%`,
                  }}
                />
              </div>
            )}

            <p className="text-[10px] text-muted-foreground truncate">
              {activeProcessingStage === "vision"
                ? "Classifying slope texture, rock displacement, and visual hazard score..."
                : modelStatus.vision.stage}
            </p>
          </div>

          {/* Model 2: Language Model (Qwen2.5-0.5B / Chrome Nano) */}
          <div className="rounded-lg border border-border/60 bg-background/60 p-2.5 space-y-1.5 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-5 w-5 rounded-md bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <MessageSquareCode className="h-3 w-3" />
                </div>
                <div>
                  <span className="font-bold text-[11px] text-foreground">
                    2. Emergency Advisory Engine
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-1">
                    (Qwen2.5-0.5B Q4 / Nano)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {modelStatus.llm.cachedInIndexedDb ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    <Database className="h-2.5 w-2.5" />
                    IndexedDB ({cacheStats && cacheStats.llmBytes > 0 ? formatBytes(cacheStats.llmBytes) : "Cached"})
                  </span>
                ) : modelStatus.llm.status === "loading" ? (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                    <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    <Sparkles className="h-2.5 w-2.5 text-purple-400" />
                    {modelStatus.llm.tierName ?? "Nepali • Bengali • Hindi • English"}
                  </span>
                )}
              </div>
            </div>

            {/* LLM Progress Bar if active */}
            {(modelStatus.llm.status === "loading" || activeProcessingStage === "advisory") && (
              <div className="w-full bg-muted/50 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-200"
                  style={{
                    width: `${
                      activeProcessingStage === "advisory"
                        ? 85
                        : Math.min(100, Math.max(5, modelStatus.llm.progress))
                    }%`,
                  }}
                />
              </div>
            )}

            <p className="text-[10px] text-muted-foreground truncate">
              {activeProcessingStage === "advisory"
                ? "Synthesizing imperative safety advisories across Nepali, Bengali, Hindi & English..."
                : modelStatus.llm.stage}
            </p>
          </div>

          {/* Storage & Delegate Meta Info */}
          <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-0.5 px-0.5">
            <span className="flex items-center gap-1">
              <Database className="h-2.5 w-2.5 text-sky-500" />
              IndexedDB Store: <code className="font-mono text-foreground">dhr-models-db</code>
            </span>
            <span>
              Total Cached:{" "}
              <strong className="text-foreground">
                {cacheStats ? formatBytes(cacheStats.totalBytes) : "Persisted"}
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

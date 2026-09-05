import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdvisoryTier,
  HazardAnalysisResult,
  Locale,
  TelemetryData,
  WorkerLifecycleMessage,
} from "@/types/intelligence";
import { getModelCacheStats, type ModelCacheStats } from "@/lib/cache/model-cache-db";

export interface DualModelStatus {
  vision: {
    status: "idle" | "loading" | "ready" | "error";
    progress: number;
    stage: string;
    delegate?: string;
    cachedInIndexedDb: boolean;
  };
  llm: {
    status: "idle" | "loading" | "ready" | "error";
    progress: number;
    stage: string;
    tierName?: string;
    cachedInIndexedDb: boolean;
  };
}

export interface UseHazardWorkerOptions {
  onResult?: (result: HazardAnalysisResult) => void;
}

export function useHazardWorker(options?: UseHazardWorkerOptions) {
  const workerRef = useRef<Worker | null>(null);
  const onResultRef = useRef(options?.onResult);

  useEffect(() => {
    onResultRef.current = options?.onResult;
  }, [options?.onResult]);

  const [lifecycleState, setLifecycleState] = useState<
    "UNINITIALIZED" | "LOADING" | "READY" | "PROCESSING" | "ERROR"
  >("UNINITIALIZED");
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [activeTier, setActiveTier] = useState<AdvisoryTier>(3);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [memoryHeapMB, setMemoryHeapMB] = useState<number | undefined>(undefined);
  const [analysisResult, setAnalysisResult] = useState<HazardAnalysisResult | null>(null);

  const [activeProcessingStage, setActiveProcessingStage] = useState<
    "vision" | "fusion" | "advisory" | null
  >(null);

  const [cacheStats, setCacheStats] = useState<ModelCacheStats | null>(null);

  const [modelStatus, setModelStatus] = useState<DualModelStatus>({
    vision: {
      status: "idle",
      progress: 0,
      stage: "Checking on-device neural vision cache...",
      cachedInIndexedDb: false,
    },
    llm: {
      status: "idle",
      progress: 0,
      stage: "Checking on-device language model cache...",
      cachedInIndexedDb: false,
    },
  });

  // Query IndexedDB cache statistics
  const refreshCacheStats = useCallback(async () => {
    try {
      const stats = await getModelCacheStats();
      setCacheStats(stats);
      setModelStatus((prev) => ({
        vision: {
          ...prev.vision,
          cachedInIndexedDb: stats.isVisionCached || prev.vision.cachedInIndexedDb,
        },
        llm: {
          ...prev.llm,
          cachedInIndexedDb: stats.isLlmCached || prev.llm.cachedInIndexedDb,
        },
      }));
    } catch {
      // Ignore initial stats read errors
    }
  }, []);

  useEffect(() => {
    refreshCacheStats();
  }, [refreshCacheStats]);

  useEffect(() => {
    const worker = new Worker(
      new URL("../../../workers/intelligence.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerLifecycleMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case "STATUS_UNINITIALIZED":
          setLifecycleState("UNINITIALIZED");
          break;

        case "STATUS_LOADING_WEIGHTS":
          setLifecycleState((current) => (current === "READY" ? current : "LOADING"));
          setLoadingProgress((current) => Math.max(current, msg.progress));
          setLoadingStage(msg.stage);

          setModelStatus((prev) => {
            const next = { ...prev };
            if (msg.modelType === "vision") {
              const incoming = msg.modelProgress?.vision ?? msg.progress;
              next.vision = {
                ...next.vision,
                status: "loading",
                progress: Math.max(prev.vision.progress, incoming),
                stage: msg.stage,
              };
            } else if (msg.modelType === "llm") {
              next.vision = {
                ...next.vision,
                status: "ready",
                progress: 100,
              };
              const incoming = msg.modelProgress?.llm ?? msg.progress;
              next.llm = {
                ...next.llm,
                status: "loading",
                progress: Math.max(prev.llm.progress, incoming),
                stage: msg.stage,
              };
            }
            return next;
          });
          break;

        case "STATUS_READY":
          setLifecycleState("READY");
          setLoadingProgress(100);
          setLoadingStage("On-device AI engine ready");
          setActiveTier(msg.activeTier);
          if (msg.memoryHeapMB) setMemoryHeapMB(msg.memoryHeapMB);
          setErrorMessage(null);
          setActiveProcessingStage(null);

          setModelStatus((prev) => ({
            vision: {
              status: "ready",
              progress: 100,
              stage: `Neural vision ready (${msg.visionDelegate})`,
              delegate: msg.visionDelegate,
              cachedInIndexedDb:
                Boolean(msg.cachedInIndexedDb?.vision) || prev.vision.cachedInIndexedDb,
            },
            llm: {
              status: "ready",
              progress: 100,
              stage: `LLM engine ready (${msg.llmDelegate || `Tier ${msg.activeTier}`})`,
              tierName: msg.llmDelegate,
              cachedInIndexedDb:
                Boolean(msg.cachedInIndexedDb?.llm) || prev.llm.cachedInIndexedDb,
            },
          }));

          refreshCacheStats();
          break;

        case "STATUS_PROCESSING":
          setLifecycleState("PROCESSING");
          if (msg.progress) setLoadingProgress(msg.progress);
          if (msg.stageDetail) setLoadingStage(msg.stageDetail);
          setActiveProcessingStage(msg.stage);
          break;

        case "STATUS_ERROR":
          setLifecycleState("ERROR");
          setErrorMessage(msg.error);
          setActiveProcessingStage(null);
          break;

        case "PROCESS_RESULT":
          setAnalysisResult(msg.result);
          if (msg.result.metrics.memoryHeapMB) {
            setMemoryHeapMB(msg.result.metrics.memoryHeapMB);
          }
          setLifecycleState("READY");
          setActiveProcessingStage(null);
          onResultRef.current?.(msg.result);
          refreshCacheStats();
          break;
      }
    };

    worker.postMessage({ type: "INIT_PIPELINE" });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [refreshCacheStats]);

  const dispatchAnalyze = useCallback(
    (
      bitmap: ImageBitmap,
      telemetry: TelemetryData,
      locale: Locale,
      forcedTier: AdvisoryTier | "auto"
    ) => {
      if (!workerRef.current) return;
      createImageBitmap(bitmap).then((transferBitmap) => {
        workerRef.current?.postMessage(
          {
            type: "ANALYZE_FRAME",
            imageBitmap: transferBitmap,
            telemetry,
            locale,
            forcedTier: forcedTier === "auto" ? undefined : forcedTier,
          },
          [transferBitmap]
        );
      });
    },
    []
  );

  const clearError = useCallback(() => setErrorMessage(null), []);

  return {
    lifecycleState,
    loadingProgress,
    loadingStage,
    activeTier,
    errorMessage,
    memoryHeapMB,
    analysisResult,
    activeProcessingStage,
    modelStatus,
    cacheStats,
    refreshCacheStats,
    dispatchAnalyze,
    clearError,
    setAnalysisResult,
  };
}

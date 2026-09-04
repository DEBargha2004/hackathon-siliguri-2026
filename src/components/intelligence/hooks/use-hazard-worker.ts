import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AdvisoryTier,
  HazardAnalysisResult,
  Locale,
  TelemetryData,
  WorkerLifecycleMessage,
} from "@/types/intelligence";

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
          setLoadingProgress(msg.progress);
          setLoadingStage(msg.stage);
          break;
        case "STATUS_READY":
          setLifecycleState("READY");
          setLoadingProgress(100);
          setLoadingStage("On-device AI engine ready");
          setActiveTier(msg.activeTier);
          if (msg.memoryHeapMB) setMemoryHeapMB(msg.memoryHeapMB);
          setErrorMessage(null);
          break;
        case "STATUS_PROCESSING":
          setLifecycleState("PROCESSING");
          if (msg.progress) setLoadingProgress(msg.progress);
          break;
        case "STATUS_ERROR":
          setLifecycleState("ERROR");
          setErrorMessage(msg.error);
          break;
        case "PROCESS_RESULT":
          setAnalysisResult(msg.result);
          if (msg.result.metrics.memoryHeapMB) {
            setMemoryHeapMB(msg.result.metrics.memoryHeapMB);
          }
          setLifecycleState("READY");
          onResultRef.current?.(msg.result);
          break;
      }
    };

    worker.postMessage({ type: "INIT_PIPELINE" });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

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
    dispatchAnalyze,
    clearError,
    setAnalysisResult,
  };
}

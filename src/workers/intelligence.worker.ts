/// <reference lib="webworker" />

import { fuseHazardContext } from "../lib/context/fusion";
import { LlmAdvisoryCascade } from "../lib/llm/cascade";
import { VisionHazardClassifier } from "../lib/vision/classifier";
import { deriveSeverity } from "../lib/vision/severity";
import { isModelTypeCached } from "../lib/cache/model-cache-db";
import type {
  AdvisoryTier,
  HazardAnalysisResult,
  WorkerLifecycleMessage,
  WorkerRequestMessage,
} from "../types/intelligence";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

const visionClassifier = new VisionHazardClassifier();
const llmCascade = new LlmAdvisoryCascade();

let activeTier: AdvisoryTier = 3;

function postLifecycle(msg: WorkerLifecycleMessage) {
  ctx.postMessage(msg);
}

function getHeapUsageMB(): number | undefined {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  if (memory && typeof memory.usedJSHeapSize === "number") {
    return Math.round(memory.usedJSHeapSize / (1024 * 1024));
  }
  return undefined;
}

// Initial status
postLifecycle({ type: "STATUS_UNINITIALIZED", message: "Worker thread started" });

ctx.onmessage = async (event: MessageEvent<WorkerRequestMessage>) => {
  const request = event.data;

  switch (request.type) {
    case "PING": {
      postLifecycle({ type: "PONG", timestamp: Date.now() });
      break;
    }

    case "INIT_PIPELINE": {
      try {
        postLifecycle({
          type: "STATUS_LOADING_WEIGHTS",
          progress: 5,
          stage: "Mounting DHR on-device intelligence pipeline...",
          modelType: "vision",
          modelProgress: { vision: 5, llm: 0 },
        });

        // 1. Initialize Vision Model with IndexedDB caching
        await visionClassifier.initialize((progress, stage) => {
          postLifecycle({
            type: "STATUS_LOADING_WEIGHTS",
            progress: Math.min(50, Math.round(progress * 0.5)),
            stage,
            modelType: "vision",
            modelProgress: { vision: progress, llm: 0 },
          });
        });

        // 2. Initialize LLM Engine with IndexedDB caching
        postLifecycle({
          type: "STATUS_LOADING_WEIGHTS",
          progress: 52,
          stage: "Initializing on-device LLM engine...",
          modelType: "llm",
          modelProgress: { vision: 100, llm: 5 },
        });

        await llmCascade.initialize((progress, stage) => {
          postLifecycle({
            type: "STATUS_LOADING_WEIGHTS",
            progress: Math.min(98, Math.round(50 + progress * 0.48)),
            stage,
            modelType: "llm",
            modelProgress: { vision: 100, llm: progress },
          });
        });

        // 3. Determine default active tier
        const aiScope =
          typeof self !== "undefined"
            ? (self as unknown as { ai?: { languageModel?: unknown } }).ai
            : undefined;
        if (aiScope?.languageModel) {
          activeTier = 1;
        } else if (typeof navigator !== "undefined" && "gpu" in navigator) {
          activeTier = 2;
        } else {
          activeTier = 3;
        }

        if (request.preferredTier) {
          activeTier = request.preferredTier;
        }

        const isVisionCached = await isModelTypeCached("vision");
        const isLlmCached = await isModelTypeCached("llm");

        const tierName =
          activeTier === 1
            ? "Chrome Nano"
            : activeTier === 2
            ? "WebGPU Qwen2.5"
            : "Deterministic Heuristic";

        postLifecycle({
          type: "STATUS_READY",
          activeTier,
          visionDelegate: visionClassifier.getDelegate(),
          llmDelegate: tierName,
          memoryHeapMB: getHeapUsageMB(),
          cachedInIndexedDb: {
            vision: isVisionCached,
            llm: isLlmCached,
          },
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Failed to initialize pipeline";
        postLifecycle({
          type: "STATUS_ERROR",
          error: errorMsg,
          fallbackTriggered: true,
          fallbackTier: 3,
        });
        activeTier = 3;
        postLifecycle({
          type: "STATUS_READY",
          activeTier: 3,
          visionDelegate: "fallback-analyzer",
          llmDelegate: "Deterministic Heuristic Fallback",
          memoryHeapMB: getHeapUsageMB(),
        });
      }
      break;
    }

    case "SET_TIER": {
      activeTier = request.tier;
      postLifecycle({
        type: "STATUS_READY",
        activeTier,
        visionDelegate: visionClassifier.getDelegate(),
        memoryHeapMB: getHeapUsageMB(),
      });
      break;
    }

    case "ANALYZE_FRAME": {
      const overallStart = performance.now();

      try {
        // Memory guardrail check before processing
        if (!llmCascade.checkMemoryGuardrail()) {
          postLifecycle({
            type: "STATUS_ERROR",
            error: "Heap allocation exceeded 1.2 GB limit. Memory guardrail tripped.",
            fallbackTriggered: true,
            fallbackTier: 3,
          });
          activeTier = 3;
        }

        // 1. Vision stage
        postLifecycle({
          type: "STATUS_PROCESSING",
          stage: "vision",
          modelType: "vision",
          stageDetail: "Vision Model: Classifying hazard features (MobileNetV4)...",
          progress: 20,
        });
        const visionStart = performance.now();

        const inputFrame = request.imageBitmap || request.imageData;
        if (!inputFrame) {
          throw new Error("No image frame provided for analysis");
        }

        const visionResult = await visionClassifier.classify(inputFrame);
        const visionLatencyMs = Math.round(performance.now() - visionStart);

        // 2. Severity scoring (rule-bound)
        const severity = deriveSeverity(
          visionResult.hazardType,
          visionResult.confidence,
          visionResult.indicators
        );

        // 3. Context fusion stage (telemetry + DHR landmark lookup)
        postLifecycle({
          type: "STATUS_PROCESSING",
          stage: "fusion",
          modelType: "fusion",
          stageDetail: "Context Fusion: Sensor telemetry & DHR landmark correlation...",
          progress: 50,
        });
        const fusionStart = performance.now();

        const fusedContext = fuseHazardContext(
          visionResult.hazardType,
          severity,
          visionResult.confidence,
          request.telemetry
        );
        const fusionLatencyMs = Math.round(performance.now() - fusionStart);

        // 4. LLM Advisory Cascade stage (3-tier)
        postLifecycle({
          type: "STATUS_PROCESSING",
          stage: "advisory",
          modelType: "llm",
          stageDetail: "LLM Engine: Synthesizing multi-locale emergency advisories...",
          progress: 75,
        });
        const tierToUse = request.forcedTier ?? activeTier;

        const advisoryResult = await llmCascade.generateAdvisory(
          fusedContext,
          request.locale,
          tierToUse,
          (progress, stageText) => {
            postLifecycle({
              type: "STATUS_PROCESSING",
              stage: "advisory",
              modelType: "llm",
              stageDetail: stageText || "LLM Engine: Generating advisory...",
              progress: Math.min(95, Math.round(75 + progress * 0.2)),
            });
          }
        );

        const totalLatencyMs = Math.round(performance.now() - overallStart);

        const analysisResult: HazardAnalysisResult = {
          id: `hazard-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          context: fusedContext,
          advisory: advisoryResult.advisory,
          advisoriesByLocale: advisoryResult.advisoriesByLocale,
          resolvedTier: advisoryResult.resolvedTier,
          tierName: advisoryResult.tierName,
          metrics: {
            visionLatencyMs,
            fusionLatencyMs,
            advisoryLatencyMs: advisoryResult.latencyMs,
            totalLatencyMs,
            memoryHeapMB: getHeapUsageMB(),
          },
          locale: request.locale,
        };

        // Emit final structured result
        postLifecycle({
          type: "PROCESS_RESULT",
          result: analysisResult,
        });

        // Reset to ready
        postLifecycle({
          type: "STATUS_READY",
          activeTier: advisoryResult.resolvedTier,
          visionDelegate: visionClassifier.getDelegate(),
          memoryHeapMB: getHeapUsageMB(),
        });
      } catch (err: unknown) {
        // Fallback gracefully on any failure
        const fallbackSeverity = "MONITOR";
        const fallbackContext = fuseHazardContext(
          request.overrideHazardType || "LANDSLIDE_SLIP",
          fallbackSeverity,
          0.5,
          request.telemetry
        );

        const fallbackAdvisory = await llmCascade.generateAdvisory(
          fallbackContext,
          request.locale,
          3
        );

        const errorMessage = err instanceof Error ? err.message : "Inference error occurred";

        postLifecycle({
          type: "STATUS_ERROR",
          error: errorMessage,
          fallbackTriggered: true,
          fallbackTier: 3,
        });

        postLifecycle({
          type: "PROCESS_RESULT",
          result: {
            id: `fallback-${Date.now()}`,
            timestamp: Date.now(),
            context: fallbackContext,
            advisory: fallbackAdvisory.advisory,
            advisoriesByLocale: fallbackAdvisory.advisoriesByLocale,
            resolvedTier: 3,
            tierName: "Deterministic Heuristic Lookup",
            metrics: {
              visionLatencyMs: 0,
              fusionLatencyMs: 0,
              advisoryLatencyMs: 2,
              totalLatencyMs: Math.round(performance.now() - overallStart),
              memoryHeapMB: getHeapUsageMB(),
            },
            locale: request.locale,
          },
        });

        postLifecycle({
          type: "STATUS_READY",
          activeTier: 3,
          visionDelegate: visionClassifier.getDelegate(),
          memoryHeapMB: getHeapUsageMB(),
        });
      }
      break;
    }
  }
};

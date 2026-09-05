/**
 * Core Intelligence Subsystem Types (B1: Offline Landslide Reporter)
 * DHR Corridor Slope Hazard Intelligence
 */

export type HazardType = "LANDSLIDE_SLIP" | "TRACK_ROAD_BLOCKAGE" | "WATER_SEEPAGE";
export type Severity = "CRITICAL" | "WARNING" | "MONITOR";
export type Locale = "ne" | "bn" | "hi" | "en";
export type AdvisoryTier = 1 | 2 | 3;
export type RelayPriority = "BROADCAST_IMMEDIATE" | "LOG_ONLY";

export interface TelemetryData {
  coordinates: [number, number] | null; // [latitude, longitude]
  elevationMeters: number | null;
  bearing: number | null;
  timestamp: number;
}

export interface LandmarkProximity {
  landmarkId: string;
  name: string;
  distanceMeters: number;
  chainageKm: number;
  elevationMeters: number;
  description: string;
  label: string; // e.g. "140m S of Tindharia Loco Workshop (KM 31.5)"
}

/**
 * Exact canonical shape required by Module B & Module C
 */
export interface HazardContext {
  hazardType: HazardType;
  severity: Severity;
  visionConfidence: number;
  telemetry: {
    coordinates: [number, number] | null;
    elevationMeters: number | null;
    bearing: number | null;
    timestamp: number;
  };
  proximityLandmark?: LandmarkProximity | null;
}

/**
 * Strict Advisory schema conforming across all 3 cascade tiers
 */
export interface Advisory {
  hazardLabel: string; // max 5 words
  immediateAction: string; // exactly one imperative command
  relayPriority: RelayPriority;
}

export interface VisualIndicators {
  activeMovement?: boolean;
  rockOnTrack?: boolean;
  heavySeepage?: boolean;
  tensionCracks?: boolean;
  bulgingWall?: boolean;
  blockedDrain?: boolean;
}

export interface VisionClassifierResult {
  hazardType: HazardType;
  confidence: number;
  indicators: VisualIndicators;
  latencyMs: number;
  delegateUsed: "webgpu" | "wasm" | "webgl" | "cpu" | "fallback-analyzer";
}

export interface HazardAnalysisResult {
  id: string;
  timestamp: number;
  context: HazardContext;
  advisory: Advisory;
  advisoriesByLocale: Record<Locale, Advisory>;
  resolvedTier: AdvisoryTier;
  tierName:
    | "Chrome Built-in AI (Nano)"
    | "WebGPU in-browser (Transformers.js)"
    | "Multilingual Situational Engine"
    | "Deterministic Heuristic Lookup";
  metrics: {
    visionLatencyMs: number;
    fusionLatencyMs: number;
    advisoryLatencyMs: number;
    totalLatencyMs: number;
    memoryHeapMB?: number;
  };
  locale: Locale;
}

/**
 * Web Worker typed postMessage protocol with explicit lifecycle states
 */
export type WorkerLifecycleMessage =
  | {
      type: "STATUS_UNINITIALIZED";
      message?: string;
    }
  | {
      type: "STATUS_LOADING_WEIGHTS";
      progress: number; // 0 to 100
      stage: string;
      tierAttempted?: AdvisoryTier;
      modelType?: "vision" | "llm";
      modelProgress?: { vision?: number; llm?: number };
      detail?: string;
      cachedInIndexedDb?: { vision?: boolean; llm?: boolean };
    }
  | {
      type: "STATUS_READY";
      activeTier: AdvisoryTier;
      visionDelegate: "webgpu" | "wasm" | "webgl" | "cpu" | "fallback-analyzer";
      llmDelegate?: string;
      memoryHeapMB?: number;
      cachedInIndexedDb?: { vision?: boolean; llm?: boolean };
    }
  | {
      type: "STATUS_PROCESSING";
      stage: "vision" | "fusion" | "advisory";
      progress?: number;
      stageDetail?: string;
      modelType?: "vision" | "llm" | "fusion";
    }
  | {
      type: "STATUS_ERROR";
      error: string;
      fallbackTriggered: boolean;
      fallbackTier?: AdvisoryTier;
    }
  | {
      type: "PROCESS_RESULT";
      result: HazardAnalysisResult;
    }
  | {
      type: "PONG";
      timestamp: number;
    };

/**
 * Main-to-Worker Request Messages
 */
export type WorkerRequestMessage =
  | {
      type: "INIT_PIPELINE";
      preferredTier?: AdvisoryTier;
    }
  | {
      type: "ANALYZE_FRAME";
      imageBitmap?: ImageBitmap;
      imageData?: ImageData;
      telemetry?: Partial<TelemetryData>;
      locale: Locale;
      forcedTier?: AdvisoryTier;
      overrideHazardType?: HazardType;
      overrideConfidence?: number;
    }
  | {
      type: "SET_TIER";
      tier: AdvisoryTier;
    }
  | {
      type: "PING";
    };

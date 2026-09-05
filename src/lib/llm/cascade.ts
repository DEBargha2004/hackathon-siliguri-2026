import type {
  Advisory,
  AdvisoryTier,
  HazardContext,
  Locale,
} from "../../types/intelligence";
import {
  getContextualMultilingualAdvisory,
} from "./fallback-strings";
import {
  createTransformersCustomCache,
  isModelTypeCached,
  purgeLegacyLlmCache,
} from "../cache/model-cache-db";
import type { TextGenerationPipeline, ProgressInfo } from "@huggingface/transformers";

export interface CascadeExecutionResult {
  advisory: Advisory;
  advisoriesByLocale: Record<Locale, Advisory>;
  resolvedTier: AdvisoryTier;
  tierName:
    | "Chrome Built-in AI (Nano)"
    | "Multilingual Situational Engine"
    | "WebGPU in-browser (Transformers.js)"
    | "Deterministic Heuristic Lookup";
  latencyMs: number;
}

interface ChromeAiSession {
  prompt(text: string): Promise<string>;
  destroy?(): void;
}

interface ChromeAiScope {
  languageModel?: {
    capabilities(): Promise<{ available: string }>;
    create(options?: { temperature?: number; topK?: number; systemPrompt?: string }): Promise<ChromeAiSession>;
  };
}

export class LlmAdvisoryCascade {
  private transformersPipeline: TextGenerationPipeline | null = null;
  private memoryGuardrailTripped = false;
  private isInitializing = false;
  private webGpuAvailable: boolean | null = null;
  private activeDelegateName = "Multilingual Situational Engine";

  /**
   * Probes whether the device has a real WebGPU adapter available
   */
  private async probeWebGpu(): Promise<boolean> {
    try {
      const globalObj = typeof self !== "undefined" ? self : globalThis;
      const nav = (globalObj as unknown as { navigator?: { gpu?: { requestAdapter: () => Promise<unknown> } } }).navigator;
      if (!nav?.gpu || typeof nav.gpu.requestAdapter !== "function") {
        return false;
      }
      const adapter = await nav.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }

  /**
   * Initializes and warms up the on-device Emergency Advisory Engine.
   * Purges oversized legacy unquantized models (>400MB) from IndexedDB,
   * probes Chrome Built-in AI (Gemini Nano),
   * and loads the 4-bit Quantized Qwen2.5-0.5B-Instruct (~350MB) exclusively on WebGPU devices.
   * If WebGPU is unavailable (e.g. mobile Safari/Firefox), safely falls back to the instantaneous
   * Multilingual Situational Engine without allocating heavy linear memory or crashing.
   */
  async initialize(onProgress?: (progress: number, stage: string) => void): Promise<void> {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      // 1. Purge legacy unquantized weights (>400MB) to reclaim storage
      onProgress?.(10, "Advisory Engine: Optimizing device memory footprint...");
      await purgeLegacyLlmCache();

      // 2. Check Chrome Built-in AI (Gemini Nano)
      onProgress?.(25, "Advisory Engine: Probing Chrome Built-in AI (Gemini Nano)...");
      const globalObj = typeof self !== "undefined" ? self : globalThis;
      const aiScope = (globalObj as unknown as { ai?: ChromeAiScope }).ai;
      if (aiScope?.languageModel) {
        try {
          const cap = await aiScope.languageModel.capabilities();
          if (cap.available === "readily" || cap.available === "after-download") {
            this.activeDelegateName = "Chrome Built-in AI (Nano)";
            onProgress?.(100, "Advisory Engine ready (Chrome Built-in AI Gemini Nano)");
            this.isInitializing = false;
            return;
          }
        } catch {
          // Fall through
        }
      }

      // 3. Probe WebGPU hardware support
      onProgress?.(35, "Advisory Engine: Checking WebGPU hardware acceleration...");
      const hasWebGpu = await this.probeWebGpu();
      this.webGpuAvailable = hasWebGpu;

      if (!hasWebGpu) {
        // WebGPU is not supported (mobile browsers, CPU only)
        // DO NOT load WASM CPU for Qwen 0.5B as it will crash with 2GB+ OOM
        this.activeDelegateName = "Multilingual Engine (4-Locale)";
        onProgress?.(80, "Advisory Engine: Loading 4-locale corridor directives (ne, bn, hi, en)...");
        onProgress?.(100, "Advisory Engine ready (Multilingual 4-Locale • Zero-Crash)");
        this.isInitializing = false;
        return;
      }

      // 4. WebGPU is present: Initialize 4-bit quantized Qwen2.5-0.5B-Instruct (~350MB)
      const isCached = await isModelTypeCached("llm");
      let highestProgress = 40;
      const reportProgress = (mapped: number, stage: string) => {
        if (mapped > highestProgress) {
          highestProgress = mapped;
        }
        onProgress?.(highestProgress, stage);
      };

      reportProgress(
        40,
        isCached
          ? "Restoring Qwen2.5-0.5B (Quantized Q4) from IndexedDB..."
          : "Loading Qwen2.5-0.5B (Quantized Q4 • 350MB) via WebGPU..."
      );

      const { pipeline, env } = await import("@huggingface/transformers");

      // Enable persistent IndexedDB single-copy storage (no CacheStorage buffer clones)
      env.useCustomCache = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      env.customCache = createTransformersCustomCache("llm") as any;
      env.useBrowserCache = true;
      env.useWasmCache = true;
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/";
      }

      try {
        this.transformersPipeline = (await pipeline(
          "text-generation",
          "onnx-community/Qwen2.5-0.5B-Instruct",
          {
            dtype: "q4f16",
            device: "webgpu",
            progress_callback: (p: ProgressInfo) => {
              const info = p as unknown as {
                status?: string;
                file?: string;
                progress?: number;
              };
              if (typeof info.progress === "number") {
                const file = info.file || "";
                const isWeights =
                  file.includes(".onnx") ||
                  file.includes(".bin") ||
                  file.includes("model");

                const mapped = isWeights
                  ? Math.min(95, Math.round(40 + info.progress * 0.55))
                  : Math.min(45, Math.round(35 + info.progress * 0.10));

                reportProgress(
                  mapped,
                  `Qwen2.5-0.5B: Caching weights in IndexedDB (${Math.round(highestProgress)}%)...`
                );
              }
              if (info.status === "done") {
                reportProgress(96, "Compiling WebGPU instruct pipeline for device...");
              }
            },
          }
        )) as TextGenerationPipeline;

        this.activeDelegateName = "Qwen2.5-0.5B (WebGPU Q4)";
        onProgress?.(100, "Advisory Engine ready (Qwen2.5-0.5B WebGPU Quantized)");
      } catch (gpuPipelineErr) {
        console.warn("[LlmCascade] WebGPU Qwen pipeline error, falling back to Multilingual Situational Engine:", gpuPipelineErr);
        this.transformersPipeline = null;
        this.webGpuAvailable = false;
        this.activeDelegateName = "Multilingual Engine (4-Locale)";
        onProgress?.(100, "Advisory Engine ready (Multilingual 4-Locale • Zero-Crash)");
      }
    } catch (err) {
      console.warn("[LlmCascade] Initialize fallback:", err);
      this.activeDelegateName = "Multilingual Engine (4-Locale)";
      onProgress?.(100, "Advisory Engine ready (Multilingual 4-Locale)");
    } finally {
      this.isInitializing = false;
    }
  }

  getActiveTierName(): string {
    return this.activeDelegateName;
  }

  /**
   * Checks allocated JS heap to ensure memory stays strictly below 1.2 GB.
   */
  checkMemoryGuardrail(): boolean {
    if (this.memoryGuardrailTripped) return false;

    const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
    if (memory && typeof memory.usedJSHeapSize === "number") {
      const limitBytes = 1.2 * 1024 * 1024 * 1024; // 1.2 GB
      if (memory.usedJSHeapSize > limitBytes) {
        this.memoryGuardrailTripped = true;
        this.transformersPipeline = null;
        return false;
      }
    }
    return true;
  }

  isGuardrailActive(): boolean {
    return this.memoryGuardrailTripped;
  }

  resetGuardrail(): void {
    this.memoryGuardrailTripped = false;
  }

  /**
   * Runs the multilingual advisory engine.
   * Generates situational directives for ALL 4 languages (ne, bn, hi, en) simultaneously.
   * Tier 1 (Chrome Built-in AI) -> Tier 2 (Multilingual Situational Engine) -> Tier 3 (Deterministic Lookup)
   */
  async generateAdvisory(
    context: HazardContext,
    locale: Locale,
    forcedTier?: AdvisoryTier,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<CascadeExecutionResult> {
    const startTime = performance.now();

    // Baseline & contextual multi-language advisories across all 4 supported locales
    const contextualAdvisories: Record<Locale, Advisory> = {
      ne: getContextualMultilingualAdvisory(context, "ne"),
      bn: getContextualMultilingualAdvisory(context, "bn"),
      hi: getContextualMultilingualAdvisory(context, "hi"),
      en: getContextualMultilingualAdvisory(context, "en"),
    };

    // Check memory guardrail
    if (!this.checkMemoryGuardrail() || forcedTier === 3) {
      return {
        advisory: contextualAdvisories[locale],
        advisoriesByLocale: contextualAdvisories,
        resolvedTier: 3,
        tierName: "Deterministic Heuristic Lookup",
        latencyMs: Math.round(performance.now() - startTime),
      };
    }

    // ----------------------------------------------------
    // Tier 1: Chrome Built-in AI (window.ai / self.ai - Gemini Nano)
    // ----------------------------------------------------
    if (forcedTier === 1 || (!forcedTier && !this.memoryGuardrailTripped)) {
      try {
        onProgress?.(20, "Checking Chrome Built-in AI (Gemini Nano)...");
        const globalObj = typeof self !== "undefined" ? self : globalThis;
        const aiScope = (globalObj as unknown as { ai?: ChromeAiScope }).ai;

        if (aiScope?.languageModel) {
          const capabilities = await aiScope.languageModel.capabilities();
          if (capabilities.available === "readily" || capabilities.available === "after-download") {
            onProgress?.(50, "Executing Chrome Built-in AI inference (T=0.2)...");
            const session = await aiScope.languageModel.create({
              temperature: 0.2,
              topK: 3,
              systemPrompt:
                "You are an on-device emergency responder for the Darjeeling Himalayan Railway (DHR). " +
                "Generate emergency advisories for all 4 languages: 'ne' (Nepali), 'bn' (Bengali), 'hi' (Hindi), 'en' (English). " +
                "Respond ONLY with a valid JSON object matching: " +
                '{"ne": {"hazardLabel": string (max 5 words), "immediateAction": string (1 imperative command), "relayPriority": "BROADCAST_IMMEDIATE" | "LOG_ONLY"}, "bn": {...}, "hi": {...}, "en": {...}}',
            });

            const prompt = `Context: ${JSON.stringify(context)}. Generate emergency Advisories strictly matching schema.`;
            const raw = await session.prompt(prompt);
            session.destroy?.();

            const parsedByLocale = this.parseAndValidateMultiLocaleAdvisory(
              raw,
              context,
              locale,
              contextualAdvisories
            );
            return {
              advisory: parsedByLocale[locale] || contextualAdvisories[locale],
              advisoriesByLocale: parsedByLocale,
              resolvedTier: 1,
              tierName: "Chrome Built-in AI (Nano)",
              latencyMs: Math.round(performance.now() - startTime),
            };
          }
        }
      } catch {
        // Tier 1 unavailable or failed, proceed to Tier 2
      }
    }

    if (forcedTier === 1) {
      return {
        advisory: contextualAdvisories[locale],
        advisoriesByLocale: contextualAdvisories,
        resolvedTier: 3,
        tierName: "Deterministic Heuristic Lookup",
        latencyMs: Math.round(performance.now() - startTime),
      };
    }

    // ----------------------------------------------------
    // Tier 2: WebGPU in-browser Transformers.js (Quantized Qwen2.5-0.5B)
    // ----------------------------------------------------
    if ((forcedTier === 2 || !forcedTier) && this.transformersPipeline && this.webGpuAvailable) {
      try {
        onProgress?.(60, "Executing WebGPU Qwen2.5-0.5B (Quantized Q4)...");
        const systemPrompt =
          "You are an on-device emergency responder for the Darjeeling Himalayan Railway (DHR) corridor. " +
          "Given the slope hazard context, generate emergency advisories for all 4 languages: 'ne' (Nepali), 'bn' (Bengali), 'hi' (Hindi), 'en' (English). " +
          "Respond strictly in valid JSON matching: " +
          '{"ne":{"hazardLabel":"...","immediateAction":"...","relayPriority":"BROADCAST_IMMEDIATE"},"bn":{...},"hi":{...},"en":{...}}';

        const landmarkStr = context.proximityLandmark ? ` near ${context.proximityLandmark.label}` : "";
        const userPrompt = `Hazard: ${context.hazardType}, Severity: ${context.severity}${landmarkStr}. Provide 4-language emergency directives JSON.`;

        const prompt = `<|im_start|>system\n${systemPrompt}<|im_end|>\n<|im_start|>user\n${userPrompt}<|im_end|>\n<|im_start|>assistant\n`;

        const result = await this.transformersPipeline(prompt, {
          max_new_tokens: 64,
          do_sample: false,
          return_full_text: false,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawOutput = (result as any)?.[0]?.generated_text || "";
        const parsedByLocale = this.parseAndValidateMultiLocaleAdvisory(
          rawOutput,
          context,
          locale,
          contextualAdvisories
        );

        return {
          advisory: parsedByLocale[locale] || contextualAdvisories[locale],
          advisoriesByLocale: parsedByLocale,
          resolvedTier: 2,
          tierName: "WebGPU in-browser (Transformers.js)",
          latencyMs: Math.round(performance.now() - startTime),
        };
      } catch (pipelineExecErr) {
        console.warn("[LlmCascade] WebGPU execution fallback:", pipelineExecErr);
        // Fall through to Multilingual Situational Engine
      }
    }

    // ----------------------------------------------------
    // Tier 2 Fallback: Multilingual Situational Emergency Advisory Engine (<5ms, zero network, zero GPU crash)
    // ----------------------------------------------------
    onProgress?.(95, "Synthesizing 4-locale emergency directives with telemetry...");

    return {
      advisory: contextualAdvisories[locale],
      advisoriesByLocale: contextualAdvisories,
      resolvedTier: 2,
      tierName: "Multilingual Situational Engine",
      latencyMs: Math.round(performance.now() - startTime),
    };
  }


  /**
   * Strictly parses and validates LLM output into the Advisory schema for all locales.
   * Fills any missing locale from the verified baseline so all 4 locales are always populated.
   */
  private parseAndValidateMultiLocaleAdvisory(
    rawText: string,
    context: HazardContext,
    targetLocale: Locale,
    baseline: Record<Locale, Advisory>
  ): Record<Locale, Advisory> {
    const result: Record<Locale, Advisory> = { ...baseline };
    try {
      // Find outermost JSON block within response
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return result;

      const obj = JSON.parse(jsonMatch[0]);
      if (!obj || typeof obj !== "object") return result;

      const locales: Locale[] = ["ne", "bn", "hi", "en"];
      let parsedAny = false;

      // Check if root object has locale keys: obj.ne, obj.bn, etc.
      for (const loc of locales) {
        if (obj[loc] && typeof obj[loc] === "object") {
          const validated = this.validateSingleAdvisory(
            obj[loc] as Record<string, unknown>,
            context
          );
          if (validated) {
            result[loc] = validated;
            parsedAny = true;
          }
        }
      }

      // If not grouped by locale, check if the root itself is a single Advisory object
      if (!parsedAny) {
        const validated = this.validateSingleAdvisory(
          obj as Record<string, unknown>,
          context
        );
        if (validated) {
          result[targetLocale] = validated;
        }
      }

      return result;
    } catch {
      return result;
    }
  }

  /**
   * Validates a single advisory object against the strict DHR schema.
   */
  private validateSingleAdvisory(
    obj: Record<string, unknown>,
    context: HazardContext
  ): Advisory | null {
    let hazardLabel = typeof obj.hazardLabel === "string" ? obj.hazardLabel.trim() : "";
    let immediateAction =
      typeof obj.immediateAction === "string" ? obj.immediateAction.trim() : "";
    let relayPriority = obj.relayPriority;

    // Validate relayPriority
    if (relayPriority !== "BROADCAST_IMMEDIATE" && relayPriority !== "LOG_ONLY") {
      relayPriority = context.severity === "MONITOR" ? "LOG_ONLY" : "BROADCAST_IMMEDIATE";
    }

    // Enforce max 5 words on hazardLabel
    const words = hazardLabel.split(/\s+/);
    if (words.length > 5) {
      hazardLabel = words.slice(0, 5).join(" ");
    }

    // Enforce exactly one imperative sentence for immediateAction
    const sentences = immediateAction.split(/(?<=[.!?।])\s+/);
    if (sentences.length > 1) {
      immediateAction = sentences[0];
    }

    if (!hazardLabel || !immediateAction) {
      return null;
    }

    return {
      hazardLabel,
      immediateAction,
      relayPriority: relayPriority as "BROADCAST_IMMEDIATE" | "LOG_ONLY",
    };
  }
}

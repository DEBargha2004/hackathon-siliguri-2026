import type {
  Advisory,
  AdvisoryTier,
  HazardContext,
  Locale,
} from "../../types/intelligence";
import { getDeterministicAdvisory } from "./fallback-strings";

export interface CascadeExecutionResult {
  advisory: Advisory;
  advisoriesByLocale: Record<Locale, Advisory>;
  resolvedTier: AdvisoryTier;
  tierName: "Chrome Built-in AI (Nano)" | "WebGPU in-browser (Transformers.js)" | "Deterministic Heuristic Lookup";
  latencyMs: number;
}

import type { TextGenerationPipeline, ProgressInfo } from "@huggingface/transformers";

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
        // Purge memory
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
   * Runs the 3-tier LLM Advisory Cascade in strict order.
   * Generates advisories for ALL languages (ne, bn, hi, en) simultaneously.
   * Tier 1 (Chrome Built-in AI) -> Tier 2 (WebGPU Transformers.js) -> Tier 3 (Deterministic Lookup)
   */
  async generateAdvisory(
    context: HazardContext,
    locale: Locale,
    forcedTier?: AdvisoryTier,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<CascadeExecutionResult> {
    const startTime = performance.now();

    // Baseline deterministic advisories for all 4 supported locales
    const baselineAdvisories: Record<Locale, Advisory> = {
      ne: getDeterministicAdvisory(context.hazardType, context.severity, "ne"),
      bn: getDeterministicAdvisory(context.hazardType, context.severity, "bn"),
      hi: getDeterministicAdvisory(context.hazardType, context.severity, "hi"),
      en: getDeterministicAdvisory(context.hazardType, context.severity, "en"),
    };

    // Check memory guardrail
    if (!this.checkMemoryGuardrail() || forcedTier === 3) {
      return {
        advisory: baselineAdvisories[locale],
        advisoriesByLocale: baselineAdvisories,
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
              baselineAdvisories
            );
            return {
              advisory: parsedByLocale[locale] || baselineAdvisories[locale],
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
      // If forced to Tier 1 and it failed, fall back to Tier 3
      return {
        advisory: baselineAdvisories[locale],
        advisoriesByLocale: baselineAdvisories,
        resolvedTier: 3,
        tierName: "Deterministic Heuristic Lookup",
        latencyMs: Math.round(performance.now() - startTime),
      };
    }

    // ----------------------------------------------------
    // Tier 2: WebGPU in-browser (HuggingFace Transformers.js)
    // ----------------------------------------------------
    if (forcedTier === 2 || (!forcedTier && !this.memoryGuardrailTripped)) {
      try {
        const hasWebGPU = typeof navigator !== "undefined" && "gpu" in navigator;
        if (hasWebGPU) {
          onProgress?.(30, "Checking WebGPU pipeline...");
          if (!this.checkMemoryGuardrail()) {
            throw new Error("Memory limit exceeded 1.2 GB");
          }

          const parsedByLocale = await this.executeWebGpuInference(
            context,
            locale,
            baselineAdvisories,
            onProgress
          );
          if (parsedByLocale) {
            return {
              advisory: parsedByLocale[locale] || baselineAdvisories[locale],
              advisoriesByLocale: parsedByLocale,
              resolvedTier: 2,
              tierName: "WebGPU in-browser (Transformers.js)",
              latencyMs: Math.round(performance.now() - startTime),
            };
          }
        }
      } catch {
        // Tier 2 failed or WebGPU unavailable, proceed to Tier 3
      }
    }

    // ----------------------------------------------------
    // Tier 3: Deterministic Fallback (<10 ms, zero network, zero GPU)
    // ----------------------------------------------------
    onProgress?.(95, "Resolving Tier 3 Deterministic Lookup (<10ms)...");

    return {
      advisory: baselineAdvisories[locale],
      advisoriesByLocale: baselineAdvisories,
      resolvedTier: 3,
      tierName: "Deterministic Heuristic Lookup",
      latencyMs: Math.round(performance.now() - startTime),
    };
  }

  /**
   * Executes WebGPU quantized model inference via @huggingface/transformers
   */
  private async executeWebGpuInference(
    context: HazardContext,
    locale: Locale,
    baseline: Record<Locale, Advisory>,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<Record<Locale, Advisory> | null> {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");

      // Configure Transformers.js offline caching & WebGPU backend
      env.useBrowserCache = true;
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/";
      }

      if (!this.transformersPipeline) {
        onProgress?.(40, "Compiling WebGPU quantized instruct weights...");
        // Use an ultra-compact, quantized instruct model
        this.transformersPipeline = (await pipeline(
          "text-generation",
          "onnx-community/Qwen2.5-0.5B-Instruct",
          {
            dtype: "q4",
            device: "webgpu",
            progress_callback: (p: ProgressInfo) => {
              if ("progress" in p && typeof p.progress === "number") {
                onProgress?.(Math.round(40 + p.progress * 0.4), "Downloading model weights...");
              }
            },
          }
        )) as unknown as TextGenerationPipeline;
      }

      onProgress?.(80, "Executing WebGPU text generation...");

      const systemMessage =
        "You are an on-device emergency adviser along the Darjeeling Himalayan Railway. Output ONLY a valid JSON object matching: " +
        `{"hazardLabel": "max 5 words", "immediateAction": "one imperative command", "relayPriority": "${context.severity === "MONITOR" ? "LOG_ONLY" : "BROADCAST_IMMEDIATE"}"}. ` +
        `Language required: ${locale}.`;

      const userPrompt = `HazardContext: ${JSON.stringify(context)}`;

      const messages = [
        { role: "system", content: systemMessage },
        { role: "user", content: userPrompt },
      ];

      if (!this.transformersPipeline) return null;

      const output = (await this.transformersPipeline(
        messages as unknown as Parameters<TextGenerationPipeline>[0],
        {
          max_new_tokens: 64,
          temperature: 0.2,
          top_k: 3,
          do_sample: false,
        }
      )) as unknown as Array<{ generated_text?: Array<{ content?: string }> }>;

      const responseText = output?.[0]?.generated_text?.at(-1)?.content ?? "";
      return this.parseAndValidateMultiLocaleAdvisory(
        responseText,
        context,
        locale,
        baseline
      );
    } catch {
      return null;
    }
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

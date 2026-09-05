import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export const MODEL_DB_NAME = "dhr-models-db";
export const MODEL_DB_VERSION = 1;
export const MODEL_STORE_NAME = "model_files";

export interface ModelFileRecord {
  url: string;
  modelType: "vision" | "llm" | "common";
  headers: Record<string, string>;
  status: number;
  statusText: string;
  buffer: ArrayBuffer;
  byteLength: number;
  cachedAt: number;
}

export interface DHRModelDBSchema extends DBSchema {
  model_files: {
    key: string;
    value: ModelFileRecord;
    indexes: {
      "by-modelType": string;
      "by-cachedAt": number;
    };
  };
}

let modelDbPromise: Promise<IDBPDatabase<DHRModelDBSchema>> | null = null;

export function getModelDB(): Promise<IDBPDatabase<DHRModelDBSchema>> {
  if (!modelDbPromise) {
    modelDbPromise = openDB<DHRModelDBSchema>(MODEL_DB_NAME, MODEL_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(MODEL_STORE_NAME)) {
          const store = db.createObjectStore(MODEL_STORE_NAME, {
            keyPath: "url",
          });
          store.createIndex("by-modelType", "modelType");
          store.createIndex("by-cachedAt", "cachedAt");
        }
      },
    });
  }
  return modelDbPromise;
}

/**
 * Normalizes request input to a URL string
 */
function normalizeRequestUrl(request: unknown): string {
  if (typeof request === "string") return request;
  if (
    request &&
    typeof request === "object" &&
    "url" in request &&
    typeof (request as { url: unknown }).url === "string"
  ) {
    return (request as { url: string }).url;
  }
  return String(request);
}

/**
 * Detects whether an asset URL belongs to the vision or LLM model
 */
export function classifyModelType(
  url: string,
  preferredType?: "vision" | "llm"
): "vision" | "llm" | "common" {
  const lower = url.toLowerCase();
  if (
    lower.includes("mobilenet") ||
    lower.includes("vision") ||
    lower.includes("image-classification")
  ) {
    return "vision";
  }
  if (
    lower.includes("qwen") ||
    lower.includes("instruct") ||
    lower.includes("text-generation") ||
    lower.includes("tokenizer")
  ) {
    return "llm";
  }
  return preferredType ?? "common";
}

export interface TransformersCustomCache {
  match: (request: unknown) => Promise<Response | undefined>;
  put: (
    request: unknown,
    response: Response,
    progress_callback?: (data: { progress: number; loaded: number; total: number }) => void
  ) => Promise<void>;
  delete?: (request: unknown) => Promise<boolean>;
}

/**
 * Creates an IndexedDB-backed Custom Cache implementation matching the Transformers.js
 * CacheInterface (env.customCache).
 *
 * Ensures all model weights (.onnx), tokenizers, configs (.json), and wasm binaries
 * are permanently saved in IndexedDB and served instantly offline.
 */
export function createTransformersCustomCache(
  modelType: "vision" | "llm"
): TransformersCustomCache {
  return {
    async match(request: unknown): Promise<Response | undefined> {
      const url = normalizeRequestUrl(request);
      try {
        const db = await getModelDB();
        const record = await db.get(MODEL_STORE_NAME, url);

        if (record && record.buffer) {
          const headers = new Headers(record.headers);
          // Return a fresh Response instance with a slice of the stored buffer
          return new Response(record.buffer.slice(0), {
            status: record.status || 200,
            statusText: record.statusText || "OK",
            headers,
          });
        }

        // Fallback: check browser Cache Storage if available and backport to IndexedDB
        if (typeof caches !== "undefined") {
          try {
            const cacheKey = "transformers-cache";
            const browserCache = await caches.open(cacheKey);
            const cachedRes = await browserCache.match(url);
            if (cachedRes) {
              const clone = cachedRes.clone();
              const buffer = await clone.arrayBuffer();
              const headersObj: Record<string, string> = {};
              cachedRes.headers.forEach((val, key) => {
                headersObj[key] = val;
              });

              // Backport to IndexedDB
              await db.put(MODEL_STORE_NAME, {
                url,
                modelType: classifyModelType(url, modelType),
                headers: headersObj,
                status: cachedRes.status || 200,
                statusText: cachedRes.statusText || "OK",
                buffer,
                byteLength: buffer.byteLength,
                cachedAt: Date.now(),
              });

              return cachedRes;
            }
          } catch {
            // Ignore cache storage lookup errors
          }
        }
      } catch (err) {
        console.warn(`[ModelCache] IndexedDB match error for ${url}:`, err);
      }

      return undefined;
    },

    async put(
      request: unknown,
      response: Response,
      progress_callback?: (data: { progress: number; loaded: number; total: number }) => void
    ): Promise<void> {
      const url = normalizeRequestUrl(request);
      try {
        const db = await getModelDB();

        // Read the response buffer
        const buffer = await response.clone().arrayBuffer();
        const headersObj: Record<string, string> = {};
        if (response.headers) {
          response.headers.forEach((val, key) => {
            headersObj[key] = val;
          });
        }
        if (!headersObj["content-length"]) {
          headersObj["content-length"] = buffer.byteLength.toString();
        }

        const determinedType = classifyModelType(url, modelType);

        await db.put(MODEL_STORE_NAME, {
          url,
          modelType: determinedType,
          headers: headersObj,
          status: response.status || 200,
          statusText: response.statusText || "OK",
          buffer,
          byteLength: buffer.byteLength,
          cachedAt: Date.now(),
        });

        // Mirror into Cache Storage only for small metadata files (< 10 MB).
        // Never clone heavy model weight buffers (e.g. 350MB Qwen weights) to prevent worker heap spikes and OOM crashes.
        if (typeof caches !== "undefined" && buffer.byteLength < 10 * 1024 * 1024) {
          try {
            const cacheKey = "transformers-cache";
            const browserCache = await caches.open(cacheKey);
            const resForCache = new Response(buffer.slice(0), {
              headers: new Headers(headersObj),
              status: response.status,
              statusText: response.statusText,
            });
            await browserCache.put(url, resForCache);
          } catch {
            // Ignore secondary cache errors
          }
        }

        if (progress_callback) {
          progress_callback({
            progress: 100,
            loaded: buffer.byteLength,
            total: buffer.byteLength,
          });
        }
      } catch (err) {
        console.warn(`[ModelCache] Failed to store ${url} in IndexedDB:`, err);
      }
    },

    async delete(request: unknown): Promise<boolean> {
      const url = normalizeRequestUrl(request);
      try {
        const db = await getModelDB();
        await db.delete(MODEL_STORE_NAME, url);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Purges legacy unquantized/oversized LLM records (>400MB) from older runs to reclaim device memory,
 * while preserving optimized 4-bit quantized Qwen files (~350MB total).
 */
export async function purgeLegacyLlmCache(): Promise<number> {
  try {
    const db = await getModelDB();
    const records = await db.getAll(MODEL_STORE_NAME);
    let purgedBytes = 0;

    for (const record of records) {
      const isLlm = record.modelType === "llm" || classifyModelType(record.url) === "llm";
      // Unquantized Qwen weights exceeded 400MB; 4-bit quantized shards are smaller
      const isOversized = record.byteLength > 400 * 1024 * 1024;
      const isUnquantizedOnnx = record.url.includes("model.onnx") && !record.url.includes("q4");

      if (isLlm && (isOversized || isUnquantizedOnnx)) {
        purgedBytes += record.byteLength || 0;
        await db.delete(MODEL_STORE_NAME, record.url);
      }
    }

    return purgedBytes;
  } catch {
    return 0;
  }
}

/**
 * Purges all LLM weights from IndexedDB and browser cache storage
 */
export async function purgeLlmCache(): Promise<number> {
  try {
    const db = await getModelDB();
    const records = await db.getAll(MODEL_STORE_NAME);
    let purgedBytes = 0;

    for (const record of records) {
      if (record.modelType === "llm" || classifyModelType(record.url) === "llm") {
        purgedBytes += record.byteLength || 0;
        await db.delete(MODEL_STORE_NAME, record.url);
      }
    }

    // Also clean from browser Cache Storage if present
    if (typeof caches !== "undefined") {
      try {
        const browserCache = await caches.open("transformers-cache");
        const keys = await browserCache.keys();
        for (const req of keys) {
          if (classifyModelType(req.url) === "llm") {
            await browserCache.delete(req);
          }
        }
      } catch {
        // ignore
      }
    }

    return purgedBytes;
  } catch {
    return 0;
  }
}

export interface ModelCacheStats {
  visionCount: number;
  visionBytes: number;
  llmCount: number;
  llmBytes: number;
  totalCount: number;
  totalBytes: number;
  isVisionCached: boolean;
  isLlmCached: boolean;
}

/**
 * Inspects IndexedDB to determine how many files and bytes are cached for each model
 */
export async function getModelCacheStats(): Promise<ModelCacheStats> {
  try {
    const db = await getModelDB();
    const records = await db.getAll(MODEL_STORE_NAME);

    let visionCount = 0;
    let visionBytes = 0;
    let llmCount = 0;
    let llmBytes = 0;

    for (const record of records) {
      if (record.modelType === "vision") {
        visionCount++;
        visionBytes += record.byteLength || 0;
      } else if (record.modelType === "llm") {
        llmCount++;
        llmBytes += record.byteLength || 0;
      } else {
        // Classify based on url
        const t = classifyModelType(record.url);
        if (t === "vision") {
          visionCount++;
          visionBytes += record.byteLength || 0;
        } else if (t === "llm") {
          llmCount++;
          llmBytes += record.byteLength || 0;
        }
      }
    }

    // Vision model is considered cached if at least config and onnx weights are present
    const isVisionCached = visionCount >= 2;
    // LLM is considered cached if at least config, tokenizer, and onnx weights are present
    const isLlmCached = llmCount >= 2;

    return {
      visionCount,
      visionBytes,
      llmCount,
      llmBytes,
      totalCount: records.length,
      totalBytes: visionBytes + llmBytes,
      isVisionCached,
      isLlmCached,
    };
  } catch (err) {
    console.warn("[ModelCache] Failed to read stats from IndexedDB:", err);
    return {
      visionCount: 0,
      visionBytes: 0,
      llmCount: 0,
      llmBytes: 0,
      totalCount: 0,
      totalBytes: 0,
      isVisionCached: false,
      isLlmCached: false,
    };
  }
}

/**
 * Checks if a specific model type has files cached in IndexedDB
 */
export async function isModelTypeCached(modelType: "vision" | "llm"): Promise<boolean> {
  const stats = await getModelCacheStats();
  return modelType === "vision" ? stats.isVisionCached : stats.isLlmCached;
}

/**
 * Clears cached models from IndexedDB
 */
export async function clearModelCache(targetType?: "vision" | "llm"): Promise<void> {
  try {
    const db = await getModelDB();
    if (!targetType) {
      await db.clear(MODEL_STORE_NAME);
    } else {
      const records = await db.getAll(MODEL_STORE_NAME);
      const tx = db.transaction(MODEL_STORE_NAME, "readwrite");
      for (const record of records) {
        if (classifyModelType(record.url, record.modelType as "vision" | "llm") === targetType) {
          await tx.store.delete(record.url);
        }
      }
      await tx.done;
    }
  } catch (err) {
    console.warn("[ModelCache] Failed to clear IndexedDB cache:", err);
  }
}

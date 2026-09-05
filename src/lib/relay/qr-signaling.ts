import QRCode from "qrcode";
import type { QRChunkData } from "@/types/alert";

export const MAX_SINGLE_QR_CHARS = 850;
export const QR_CHUNK_PAYLOAD_SIZE = 450;
export const QR_CHUNK_PREFIX = "DHR:Q";

/**
 * Compact SDP string to remove unnecessary blank lines and non-critical headers
 * while strictly preserving all host candidates and SCTP setup lines.
 * Strips bloat (TCP candidates, mDNS .local, extmap, rtcp) so SDP easily fits in a single QR.
 */
export function compactSDP(sdp: string): string {
  if (!sdp) return "";

  // 1. Repair lines concatenated without newline (e.g. "...a=mid:0a=max-message-size:262144...")
  const repaired = sdp.replace(/([^\r\n])(?=[a-z]=)/g, "$1\r\n");
  const lines = repaired.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preservedLines: string[] = [];

  for (const line of lines) {
    // Strip non-critical headers
    if (line.startsWith("a=extmap:")) continue;
    if (line.startsWith("a=extmap-allow-mixed")) continue;
    if (line.startsWith("a=msid-semantic:")) continue;
    if (line.startsWith("a=rtcp:")) continue;
    if (line.startsWith("a=rtcp-mux")) continue;
    if (line.startsWith("a=rtcp-rsize")) continue;

    // Strip TCP candidates: WebRTC local data channels only use UDP host candidates
    if (line.startsWith("a=candidate:") && line.toLowerCase().includes(" tcp ")) continue;

    // Strip mDNS (.local) candidates that cannot be resolved in offline air-gapped hotspot
    if (line.startsWith("a=candidate:") && line.includes(".local")) continue;

    // Sanitize max-message-size if present
    if (line.startsWith("a=max-message-size:")) {
      const match = line.match(/^a=max-message-size:\s*(\d+)/i);
      const val = match && match[1] ? parseInt(match[1], 10) : 262144;
      const safeVal = isNaN(val) || val <= 0 ? 262144 : Math.min(val, 2147483647);
      preservedLines.push(`a=max-message-size:${safeVal}`);
      continue;
    }

    preservedLines.push(line);
  }

  // SDP RFC 4566: Every line MUST terminate with CRLF (\r\n), including the trailing line
  return preservedLines.join("\r\n") + "\r\n";
}

/**
 * Rigorously sanitizes and normalizes WebRTC SDP strings before passing to RTCSessionDescription.
 * 1. Repairs concatenated lines where CRLF was lost (e.g., "...a=mid:0a=max-message-size:262144...")
 * 2. Normalizes line endings to strict CRLF (\r\n) per RFC 4566.
 * 3. Fixes/clamps any malformed a=max-message-size line to valid WebRTC syntax.
 * 4. Ensures mandatory trailing CRLF so parsers don't reject the last line.
 */
export function sanitizeSDP(sdp: string): string {
  if (!sdp) return "";

  // 1. Repair lines concatenated without newline
  let repaired = sdp.replace(/([^\r\n])(?=[a-z]=)/g, "$1\r\n");

  // 2. Split lines and process individually
  const rawLines = repaired.split(/\r?\n/);
  const cleanLines: string[] = [];

  for (let line of rawLines) {
    line = line.trim();
    if (!line) continue;

    // Validate and sanitize a=max-message-size
    if (line.startsWith("a=max-message-size:")) {
      const match = line.match(/^a=max-message-size:\s*(\d+)/i);
      if (match && match[1]) {
        const val = parseInt(match[1], 10);
        // Clamp to max 32-bit signed integer or standard default
        const safeVal = isNaN(val) || val <= 0 ? 262144 : Math.min(val, 2147483647);
        cleanLines.push(`a=max-message-size:${safeVal}`);
      } else {
        // Corrupted value (e.g. dots or non-digits) -> fallback to standard 256KB
        cleanLines.push("a=max-message-size:262144");
      }
      continue;
    }

    cleanLines.push(line);
  }

  if (cleanLines.length === 0) return "";

  // RFC 4566: Every line MUST terminate with CRLF (\r\n), including the last line.
  return cleanLines.join("\r\n") + "\r\n";
}

/**
 * Encodes a payload into either a single QR frame or an array of chunked frames.
 * Uses line-boundary splitting where possible to avoid cutting SDP tokens across frames.
 */
export function prepareQRFrames(payload: string): string[] {
  if (payload.length <= MAX_SINGLE_QR_CHARS) {
    return [payload];
  }

  // Try line-boundary chunking first to avoid cutting tokens/CRLF
  const lines = payload.split(/(?<=\r?\n)/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const line of lines) {
    if (currentChunk.length + line.length > QR_CHUNK_PAYLOAD_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk += line;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  // Fallback if payload had no line breaks (e.g. monolithic test string)
  if (chunks.length <= 1 && payload.length > QR_CHUNK_PAYLOAD_SIZE) {
    chunks.length = 0;
    const totalChunks = Math.ceil(payload.length / QR_CHUNK_PAYLOAD_SIZE);
    for (let i = 0; i < totalChunks; i++) {
      chunks.push(
        payload.slice(i * QR_CHUNK_PAYLOAD_SIZE, (i + 1) * QR_CHUNK_PAYLOAD_SIZE)
      );
    }
  }

  const totalChunks = chunks.length;
  const frames: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    // Format: DHR:Q:<chunkIndex>:<totalChunks>:<chunkData>
    frames.push(`${QR_CHUNK_PREFIX}:${i}:${totalChunks}:${chunks[i]}`);
  }

  return frames;
}

/**
 * Generates an SVG or PNG data URL for a given text string using `qrcode`.
 * Uses 'L' error correction (larger, crisper blocks) and 4-module quiet zone margin.
 */
export async function renderQRCodeDataUrl(
  text: string,
  options?: { margin?: number; width?: number }
): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "L", // Low error correction = larger blocks, easier camera focus
    margin: options?.margin ?? 4, // 4-module white quiet zone prevents edge detection failure
    width: options?.width ?? 380, // Crisp resolution for optical scanning
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}

/**
 * Parse an incoming QR string to test if it is a chunked frame or single frame.
 * Preserves exact chunk data without trimming trailing newlines.
 */
export function parseQRFrame(scannedText: string): QRChunkData | null {
  const trimmed = scannedText.trimStart();
  if (!trimmed.startsWith(`${QR_CHUNK_PREFIX}:`)) {
    return null;
  }

  const firstColon = trimmed.indexOf(":");
  const secondColon = trimmed.indexOf(":", firstColon + 1);
  const thirdColon = trimmed.indexOf(":", secondColon + 1);
  const fourthColon = trimmed.indexOf(":", thirdColon + 1);

  if (secondColon === -1 || thirdColon === -1 || fourthColon === -1) {
    return null;
  }

  const index = parseInt(trimmed.slice(secondColon + 1, thirdColon), 10);
  const total = parseInt(trimmed.slice(thirdColon + 1, fourthColon), 10);
  // Preserve exact data including trailing CRLF
  const data = trimmed.slice(fourthColon + 1);

  if (isNaN(index) || isNaN(total) || total <= 0 || index < 0 || index >= total) {
    return null;
  }

  return { index, total, data };
}

/**
 * State manager to aggregate scanned QR chunks until a multi-frame payload is fully collected.
 */
export class QRChunkCollector {
  private chunks = new Map<number, string>();
  private expectedTotal: number | null = null;

  public reset(): void {
    this.chunks.clear();
    this.expectedTotal = null;
  }

  public feed(scannedText: string): {
    isComplete: boolean;
    data: string | null;
    progress: { current: number; total: number };
  } {
    const chunk = parseQRFrame(scannedText);

    // Case 1: Single unchunked QR frame
    if (!chunk) {
      return {
        isComplete: true,
        data: scannedText,
        progress: { current: 1, total: 1 },
      };
    }

    // Case 2: Chunked animated QR frame
    if (this.expectedTotal === null) {
      this.expectedTotal = chunk.total;
    } else if (this.expectedTotal !== chunk.total) {
      // Inconsistent sequence, reset and restart
      this.reset();
      this.expectedTotal = chunk.total;
    }

    this.chunks.set(chunk.index, chunk.data);

    const currentCount = this.chunks.size;
    const totalCount = this.expectedTotal;

    if (currentCount === totalCount) {
      // Reassemble in ascending order
      let fullPayload = "";
      for (let i = 0; i < totalCount; i++) {
        fullPayload += this.chunks.get(i) || "";
      }

      return {
        isComplete: true,
        data: fullPayload,
        progress: { current: totalCount, total: totalCount },
      };
    }

    return {
      isComplete: false,
      data: null,
      progress: { current: currentCount, total: totalCount },
    };
  }

  public getProgress(): { current: number; total: number } {
    return {
      current: this.chunks.size,
      total: this.expectedTotal ?? 1,
    };
  }
}

import QRCode from "qrcode";
import type { QRChunkData } from "@/types/alert";

export const MAX_SINGLE_QR_CHARS = 850;
export const QR_CHUNK_PAYLOAD_SIZE = 600;
export const QR_CHUNK_PREFIX = "DHR:Q";

/**
 * Compact SDP string to remove unnecessary blank lines and whitespace
 * while strictly preserving all host candidate and SCTP setup lines.
 */
export function compactSDP(sdp: string): string {
  return sdp
    .split("\r\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("a=extmap:"))
    .join("\r\n");
}

/**
 * Encodes a payload into either a single QR frame or an array of chunked frames.
 */
export function prepareQRFrames(payload: string): string[] {
  if (payload.length <= MAX_SINGLE_QR_CHARS) {
    return [payload];
  }

  const totalChunks = Math.ceil(payload.length / QR_CHUNK_PAYLOAD_SIZE);
  const frames: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkData = payload.slice(
      i * QR_CHUNK_PAYLOAD_SIZE,
      (i + 1) * QR_CHUNK_PAYLOAD_SIZE
    );
    // Format: DHR:Q:<chunkIndex>:<totalChunks>:<chunkData>
    frames.push(`${QR_CHUNK_PREFIX}:${i}:${totalChunks}:${chunkData}`);
  }

  return frames;
}

/**
 * Generates an SVG or PNG data URL for a given text string using `qrcode`.
 */
export async function renderQRCodeDataUrl(
  text: string,
  options?: { margin?: number; width?: number }
): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    margin: options?.margin ?? 2,
    width: options?.width ?? 320,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}

/**
 * Parse an incoming QR string to test if it is a chunked frame or single frame.
 */
export function parseQRFrame(scannedText: string): QRChunkData | null {
  if (!scannedText.startsWith(`${QR_CHUNK_PREFIX}:`)) {
    return null;
  }

  const firstColon = scannedText.indexOf(":");
  const secondColon = scannedText.indexOf(":", firstColon + 1);
  const thirdColon = scannedText.indexOf(":", secondColon + 1);
  const fourthColon = scannedText.indexOf(":", thirdColon + 1);

  if (secondColon === -1 || thirdColon === -1 || fourthColon === -1) {
    return null;
  }

  const index = parseInt(scannedText.slice(secondColon + 1, thirdColon), 10);
  const total = parseInt(scannedText.slice(thirdColon + 1, fourthColon), 10);
  const data = scannedText.slice(fourthColon + 1);

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

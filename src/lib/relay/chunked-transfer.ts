import type {
  AlertTransferHeader,
  AlertTransferMessage,
  OfficialAlert,
  TransferProgress,
} from "@/types/alert";
import { isAlertSeen, saveOfficialAlert } from "./alert-store";

export const CHUNK_SIZE = 16 * 1024; // 16 KB chunk size for high SCTP compatibility
export const BUFFER_HIGH_WATERMARK = 64 * 1024; // 64 KB high watermark
export const BUFFER_LOW_WATERMARK = 16 * 1024; // 16 KB threshold to resume

/**
 * Sends an official alert over an active WebRTC DataChannel.
 * Slices the photoBlob into 16KB binary frames and respects SCTP backpressure.
 */
export async function sendAlertOverChannel(
  channel: RTCDataChannel,
  alert: OfficialAlert,
  options?: {
    onProgress?: (progress: TransferProgress) => void;
  }
): Promise<void> {
  if (channel.readyState !== "open") {
    throw new Error(`Cannot send alert: DataChannel is in '${channel.readyState}' state`);
  }

  // 1. Read photoBlob into ArrayBuffer
  const photoBuffer = await alert.photoBlob.arrayBuffer();
  const totalBytes = photoBuffer.byteLength;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / CHUNK_SIZE));

  // 2. Prepare and send metadata header
  const header: AlertTransferHeader = {
    type: "ALERT_HEADER",
    alert: {
      id: alert.id,
      hazardType: alert.hazardType,
      severity: alert.severity,
      message: alert.message,
      locationName: alert.locationName,
      coordinates: alert.coordinates,
      issuedAt: alert.issuedAt,
      // Increment hop count for the recipient
      hopCount: alert.hopCount + 1,
    },
    photoSize: totalBytes,
    photoMimeType: alert.photoBlob.type || "image/jpeg",
    totalChunks,
  };

  channel.send(JSON.stringify(header));

  // 3. Send binary chunks with backpressure awareness
  channel.bufferedAmountLowThreshold = BUFFER_LOW_WATERMARK;

  let bytesTransferred = 0;

  for (let i = 0; i < totalChunks; i++) {
    // Check if channel is still open
    if (channel.readyState !== "open") {
      throw new Error("Channel closed during transfer");
    }

    // Backpressure check
    if (channel.bufferedAmount > BUFFER_HIGH_WATERMARK) {
      await new Promise<void>((resolve) => {
        const onLow = () => {
          channel.removeEventListener("bufferedamountlow", onLow);
          resolve();
        };
        channel.addEventListener("bufferedamountlow", onLow);

        // Safety fallback timeout
        setTimeout(() => {
          channel.removeEventListener("bufferedamountlow", onLow);
          resolve();
        }, 1000);
      });
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalBytes);
    const chunk = photoBuffer.slice(start, end);

    channel.send(chunk);

    bytesTransferred += chunk.byteLength;
    const progress: TransferProgress = {
      bytesTransferred,
      totalBytes,
      chunksTransferred: i + 1,
      totalChunks,
      percent: Math.round((bytesTransferred / totalBytes) * 100),
    };
    options?.onProgress?.(progress);
  }

  // 4. Send Transfer Complete flag
  channel.send(
    JSON.stringify({
      type: "TRANSFER_COMPLETE",
      alertId: alert.id,
    })
  );
}

/**
 * Listens on an active WebRTC DataChannel to reassemble the official alert and photo chunks.
 * Only saves and marks received when all chunks for the photo arrive completely.
 * Partial chunks are discarded if interrupted.
 */
export function receiveAlertOverChannel(
  channel: RTCDataChannel,
  options?: {
    onProgress?: (progress: TransferProgress) => void;
  }
): Promise<{ alert: OfficialAlert; isDuplicate: boolean }> {
  return new Promise((resolve, reject) => {
    let header: AlertTransferHeader | null = null;
    let chunks: ArrayBuffer[] = [];
    let receivedBytes = 0;
    let isAlreadyKnown = false;

    const cleanup = () => {
      channel.removeEventListener("message", onMessage);
      channel.removeEventListener("close", onClose);
      channel.removeEventListener("error", onError);
      // Clean up partial chunks from memory
      chunks = [];
    };

    const onClose = () => {
      cleanup();
      reject(new Error("Peer connection closed before alert transfer completed. Partial data discarded."));
    };

    const onError = (evt: Event) => {
      cleanup();
      reject(new Error("Channel error during transfer: " + JSON.stringify(evt)));
    };

    const onMessage = async (event: MessageEvent) => {
      try {
        // String message = JSON control protocol
        if (typeof event.data === "string") {
          const msg = JSON.parse(event.data) as AlertTransferMessage;

          if (msg.type === "ALERT_HEADER") {
            header = msg;
            chunks = [];
            receivedBytes = 0;

            // Check deduplication
            isAlreadyKnown = await isAlertSeen(header.alert.id);
            if (isAlreadyKnown) {
              // Inform host of dedup
              try {
                channel.send(
                  JSON.stringify({
                    type: "DEDUP_ACK",
                    alertId: header.alert.id,
                    message: "Alert already cached on receiver.",
                  })
                );
              } catch {
                // Ignore send error
              }
            }

            options?.onProgress?.({
              bytesTransferred: 0,
              totalBytes: header.photoSize,
              chunksTransferred: 0,
              totalChunks: header.totalChunks,
              percent: 0,
            });
          }
          return;
        }

        // Binary message = ArrayBuffer photo chunk
        if (event.data instanceof ArrayBuffer && header) {
          chunks.push(event.data);
          receivedBytes += event.data.byteLength;

          const progress: TransferProgress = {
            bytesTransferred: receivedBytes,
            totalBytes: header.photoSize,
            chunksTransferred: chunks.length,
            totalChunks: header.totalChunks,
            percent: Math.min(100, Math.round((receivedBytes / header.photoSize) * 100)),
          };
          options?.onProgress?.(progress);

          // Once all photo bytes have arrived
          if (receivedBytes >= header.photoSize) {
            const reconstructedBlob = new Blob(chunks, {
              type: header.photoMimeType || "image/jpeg",
            });

            const completedAlert: OfficialAlert = {
              id: header.alert.id,
              hazardType: header.alert.hazardType,
              severity: header.alert.severity,
              message: header.alert.message,
              locationName: header.alert.locationName,
              coordinates: header.alert.coordinates,
              issuedAt: header.alert.issuedAt,
              photoBlob: reconstructedBlob,
              hopCount: header.alert.hopCount,
            };

            // Save to IndexedDB if not duplicate
            if (!isAlreadyKnown) {
              await saveOfficialAlert(completedAlert);
            }

            cleanup();
            resolve({
              alert: completedAlert,
              isDuplicate: isAlreadyKnown,
            });
          }
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    channel.addEventListener("message", onMessage);
    channel.addEventListener("close", onClose);
    channel.addEventListener("error", onError);
  });
}

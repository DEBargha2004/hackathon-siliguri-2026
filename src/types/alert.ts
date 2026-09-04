/**
 * Official Alert Canonical Type & Transfer Protocol Types
 * Relay Down Subsystem (B1: Offline Landslide Reporter)
 */

export type HazardType = "LANDSLIDE_SLIP" | "TRACK_ROAD_BLOCKAGE" | "WATER_SEEPAGE";
export type AlertSeverity = "CRITICAL" | "WARNING" | "MONITOR";

export interface OfficialAlert {
  id: string; // stable id from Supabase — the dedup/idempotency key across all hops
  hazardType: HazardType;
  severity: AlertSeverity;
  message: string; // official instruction text
  locationName?: string;
  coordinates?: [number, number];
  issuedAt: number;
  photoBlob: Blob; // downloaded once, carried through every subsequent hop
  hopCount: number; // starts at 0, incremented by every relay
}

export interface AlertTransferHeader {
  type: "ALERT_HEADER";
  alert: {
    id: string;
    hazardType: HazardType;
    severity: AlertSeverity;
    message: string;
    locationName?: string;
    coordinates?: [number, number];
    issuedAt: number;
    hopCount: number;
  };
  photoSize: number;
  photoMimeType: string;
  totalChunks: number;
}

export interface AlertTransferComplete {
  type: "TRANSFER_COMPLETE";
  alertId: string;
}

export interface AlertTransferDedupAck {
  type: "DEDUP_ACK";
  alertId: string;
  message: string;
}

export type AlertTransferMessage =
  | AlertTransferHeader
  | AlertTransferComplete
  | AlertTransferDedupAck;

export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  chunksTransferred: number;
  totalChunks: number;
  percent: number;
}

export interface QRChunkData {
  index: number;
  total: number;
  data: string;
}

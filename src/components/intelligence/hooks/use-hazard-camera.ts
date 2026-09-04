import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceTelemetry } from "@/lib/telemetry/sensors";
import type { TelemetryData } from "@/types/intelligence";

export interface UseHazardCameraOptions {
  onTelemetryUpdate?: (telemetry: TelemetryData) => void;
}

export function useHazardCamera(options?: UseHazardCameraOptions) {
  const onTelemetryUpdateRef = useRef(options?.onTelemetryUpdate);

  useEffect(() => {
    onTelemetryUpdateRef.current = options?.onTelemetryUpdate;
  }, [options?.onTelemetryUpdate]);

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [capturedBitmap, setCapturedBitmap] = useState<ImageBitmap | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  // Helper to safely update image URL with automatic blob revocation
  const updatePreviewUrl = useCallback((newUrl: string | null) => {
    setPreviewImageUrl((prev) => {
      if (prev && prev.startsWith("blob:")) {
        URL.revokeObjectURL(prev);
      }
      return newUrl;
    });
  }, []);

  // Cleanup camera stream and any lingering preview blob on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (previewImageUrl && previewImageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [cameraStream, previewImageUrl]);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
    setCameraError(null);
  }, [cameraStream]);

  const startCamera = useCallback(
    async (facing: "environment" | "user" = cameraFacing) => {
      setCameraError(null);
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error(
            "Live camera stream is not supported in this browser context. Please tap 'Take Photo' to snap directly."
          );
        }

        if (cameraStream) {
          cameraStream.getTracks().forEach((track) => track.stop());
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        setCameraStream(stream);
        setIsCameraActive(true);
        setCameraFacing(facing);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Camera access unavailable or permission denied. You can use 'Take Photo' or presets.";
        console.warn("Camera start failed:", err);
        setCameraError(msg);
        setIsCameraActive(false);
      }
    },
    [cameraFacing, cameraStream]
  );

  const toggleCameraFacing = useCallback(async () => {
    const nextFacing = cameraFacing === "environment" ? "user" : "environment";
    await startCamera(nextFacing);
  }, [cameraFacing, startCamera]);

  const captureFrameFromVideo = useCallback(
    async (video: HTMLVideoElement) => {
      setIsFlashing(true);
      setTimeout(() => setIsFlashing(false), 220);

      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;

      const canvas = document.createElement("canvas");
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, vw, vh);

      canvas.toBlob(
        async (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          updatePreviewUrl(url);
          const bitmap = await createImageBitmap(blob);
          setCapturedBitmap(bitmap);
          setActiveScenarioId("live-camera");

          stopCamera();

          const telem = await getDeviceTelemetry();
          onTelemetryUpdateRef.current?.(telem);
        },
        "image/jpeg",
        0.92
      );
    },
    [stopCamera, updatePreviewUrl]
  );

  const handleFile = useCallback(
    async (file: File, sourceId: string) => {
      const url = URL.createObjectURL(file);
      updatePreviewUrl(url);
      const bitmap = await createImageBitmap(file);
      setCapturedBitmap(bitmap);
      setActiveScenarioId(sourceId);

      stopCamera();

      const telem = await getDeviceTelemetry();
      onTelemetryUpdateRef.current?.(telem);
    },
    [stopCamera, updatePreviewUrl]
  );

  const setPhotoFrame = useCallback(
    (url: string, bitmap: ImageBitmap, scenarioId: string) => {
      stopCamera();
      updatePreviewUrl(url);
      setCapturedBitmap(bitmap);
      setActiveScenarioId(scenarioId);
    },
    [stopCamera, updatePreviewUrl]
  );

  const clearPhoto = useCallback(() => {
    stopCamera();
    updatePreviewUrl(null);
    setCapturedBitmap(null);
    setActiveScenarioId(null);
  }, [stopCamera, updatePreviewUrl]);

  return {
    cameraStream,
    isCameraActive,
    cameraFacing,
    cameraError,
    isFlashing,
    previewImageUrl,
    capturedBitmap,
    activeScenarioId,
    startCamera,
    stopCamera,
    toggleCameraFacing,
    captureFrameFromVideo,
    handleFile,
    setPhotoFrame,
    clearPhoto,
  };
}

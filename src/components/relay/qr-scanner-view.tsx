import React, { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { Camera, FlipHorizontal, X, Keyboard, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRChunkCollector } from "@/lib/relay/qr-signaling";

export interface QRScannerViewProps {
  title?: string;
  description?: string;
  onScanComplete: (payload: string) => void;
  onCancel?: () => void;
}

export const QRScannerView: React.FC<QRScannerViewProps> = ({
  title = "Scan Peer QR Code",
  description = "Align the QR code within the frame",
  onScanComplete,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const collectorRef = useRef<QRChunkCollector>(new QRChunkCollector());

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDetectedFlash, setIsDetectedFlash] = useState<boolean>(false);
  const [isManualInputOpen, setIsManualInputOpen] = useState<boolean>(false);
  const [manualText, setManualText] = useState<string>("");

  // Cleanly stop camera
  const stopStream = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Initialize and run the scanner loop
  useEffect(() => {
    let isCancelled = false;
    collectorRef.current.reset();

    const startCamera = async () => {
      setCameraError(null);
      stopStream();

      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error("Camera streaming is not supported on this browser.");
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
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

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Start frame scan loop
        scanFrame();
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Camera permission denied or camera unavailable.";
        setCameraError(msg);
      }
    };

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const scanFrame = () => {
      if (isCancelled || !videoRef.current || !ctx) return;

      const video = videoRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const width = video.videoWidth;
        const height = video.videoHeight;

        if (width > 0 && height > 0) {
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(video, 0, 0, width, height);

          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data) {
            const feedResult = collectorRef.current.feed(code.data);

            if (feedResult.progress.total > 1) {
              setChunkProgress(feedResult.progress);
            }

            // Quick visual ping
            setIsDetectedFlash(true);
            setTimeout(() => setIsDetectedFlash(false), 200);

            if (feedResult.isComplete && feedResult.data) {
              stopStream();
              onScanComplete(feedResult.data);
              return;
            }
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };

    startCamera();

    return () => {
      isCancelled = true;
      stopStream();
    };
  }, [facingMode, onScanComplete, stopStream]);

  const toggleFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;

    const feedResult = collectorRef.current.feed(manualText.trim());
    if (feedResult.isComplete && feedResult.data) {
      stopStream();
      onScanComplete(feedResult.data);
    } else if (feedResult.progress.total > 1) {
      setChunkProgress(feedResult.progress);
      setManualText("");
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-black text-white shadow-xl flex flex-col">
      {/* Top Header */}
      <div className="relative z-20 flex items-center justify-between p-3.5 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div>
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5 text-emerald-500" />
            {title}
          </h4>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="xs"
            variant="ghost"
            onClick={toggleFacing}
            title="Flip camera"
            className="h-7 w-7 p-0 rounded-full text-foreground hover:bg-muted"
          >
            <FlipHorizontal className="h-3.5 w-3.5" />
          </Button>
          {onCancel && (
            <Button
              size="xs"
              variant="ghost"
              onClick={onCancel}
              title="Close scanner"
              className="h-7 w-7 p-0 rounded-full text-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Viewfinder Area */}
      <div className="relative aspect-[4/3] w-full bg-black/90 flex items-center justify-center overflow-hidden">
        {/* Flash Ping Effect */}
        {isDetectedFlash && (
          <div className="absolute inset-0 z-30 bg-emerald-400/30 transition-opacity duration-150 pointer-events-none" />
        )}

        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />

        {/* Reticle / Optical Target */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative h-48 w-48 rounded-xl border-2 border-dashed border-emerald-400/70 flex flex-col justify-between p-2 shadow-2xl">
            <div className="flex justify-between">
              <span className="h-4 w-4 border-t-2 border-l-2 border-emerald-400" />
              <span className="h-4 w-4 border-t-2 border-r-2 border-emerald-400" />
            </div>
            <div className="text-center">
              <span className="inline-block rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-mono font-semibold text-emerald-300">
                OPTICAL SIGNALING
              </span>
            </div>
            <div className="flex justify-between">
              <span className="h-4 w-4 border-b-2 border-l-2 border-emerald-400" />
              <span className="h-4 w-4 border-b-2 border-r-2 border-emerald-400" />
            </div>
          </div>
        </div>

        {/* Multi-frame chunk progress banner */}
        {chunkProgress && chunkProgress.total > 1 && (
          <div className="absolute bottom-3 inset-x-4 z-20 rounded-xl bg-background/95 backdrop-blur-md border border-emerald-500/40 p-2 text-foreground shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-[11px] font-medium">
                Scanning animated QR frames:{" "}
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {chunkProgress.current} / {chunkProgress.total}
                </span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              {Math.round((chunkProgress.current / chunkProgress.total) * 100)}%
            </div>
          </div>
        )}

        {/* Camera Error Banner */}
        {cameraError && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-background/95 text-center text-foreground">
            <p className="text-xs font-semibold text-destructive mb-1">Camera Stream Inactive</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mb-3">{cameraError}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsManualInputOpen(true)}
              className="rounded-full text-xs gap-1.5"
            >
              <Keyboard className="h-3.5 w-3.5" />
              Paste SDP Data Directly
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Option Bar */}
      <div className="p-2.5 bg-background border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          Point camera at peer screen
        </span>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setIsManualInputOpen(!isManualInputOpen)}
          className="text-[10px] h-6 rounded-md gap-1 text-muted-foreground hover:text-foreground"
        >
          <Keyboard className="h-3 w-3" />
          Manual Input
        </Button>
      </div>

      {/* Manual Input Sheet/Drawer */}
      {isManualInputOpen && (
        <form
          onSubmit={handleManualSubmit}
          className="p-3 bg-muted/60 border-t border-border space-y-2"
        >
          <div className="text-[10px] font-semibold text-foreground">
            Paste Handshake SDP / Chunk string:
          </div>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            rows={2}
            placeholder="Paste DHR:Q:... or SDP payload here"
            className="w-full text-[10px] font-mono p-2 rounded-lg border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setIsManualInputOpen(false)}
              className="text-[10px] h-6"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="xs"
              className="text-[10px] h-6 bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
            >
              <CheckCircle2 className="h-3 w-3" />
              Submit Payload
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};

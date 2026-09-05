import React, { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { Camera, FlipHorizontal, X, Keyboard, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRChunkCollector } from "@/lib/relay/qr-signaling";

// Polyfill type for native BarcodeDetector if not standard in DOM lib
interface NativeBarcodeDetector {
  detect(image: ImageBitmapSource): Promise<Array<{ rawValue: string }>>;
}

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
  const [isEngineNative, setIsEngineNative] = useState<boolean>(false);

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

    // Check for native BarcodeDetector support
    let barcodeDetector: NativeBarcodeDetector | null = null;
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const DetectorClass = (window as unknown as { BarcodeDetector: new (opts?: { formats: string[] }) => NativeBarcodeDetector }).BarcodeDetector;
        barcodeDetector = new DetectorClass({ formats: ["qr_code"] });
        setIsEngineNative(true);
      } catch {
        barcodeDetector = null;
        setIsEngineNative(false);
      }
    } else {
      setIsEngineNative(false);
    }

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
          videoRef.current.setAttribute("playsinline", "true");
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
    let isProcessing = false;

    const handleDetectedText = (text: string) => {
      if (!text || isCancelled) return;
      const cleanText = text.trim();
      const feedResult = collectorRef.current.feed(cleanText);

      if (feedResult.progress.total > 1) {
        setChunkProgress(feedResult.progress);
      }

      // Haptic & visual feedback
      try {
        navigator.vibrate?.(40);
      } catch {
        // ignore
      }
      setIsDetectedFlash(true);
      setTimeout(() => setIsDetectedFlash(false), 200);

      if (feedResult.isComplete && feedResult.data) {
        try {
          navigator.vibrate?.([60, 40, 60]);
        } catch {
          // ignore
        }
        stopStream();
        onScanComplete(feedResult.data);
      }
    };

    const scanFrame = async () => {
      if (isCancelled || !videoRef.current) return;

      const video = videoRef.current;
      // readyState >= 2 (HAVE_CURRENT_DATA) ensures frames are readable
      if (video.readyState >= 2 && !isProcessing) {
        isProcessing = true;
        let detected = false;

        // Strategy 1: Native BarcodeDetector (GPU accelerated, handles tilt/skew/dark mode effortlessly)
        if (barcodeDetector) {
          try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes.length > 0 && barcodes[0].rawValue) {
              handleDetectedText(barcodes[0].rawValue);
              detected = true;
            }
          } catch {
            // fallback
          }
        }

        // Strategy 2: High-speed jsQR fallback with attemptBoth & resolution downsampling
        if (!detected && ctx) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;

          if (vw > 0 && vh > 0) {
            // Downscale to max 640px to ensure 60fps throughput on CPU without frame drops
            const maxDim = 640;
            const scale = Math.min(1, maxDim / Math.max(vw, vh));
            const width = Math.round(vw * scale);
            const height = Math.round(vh * scale);

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(video, 0, 0, width, height);

            // Pass 1: Full frame scan with attemptBoth for inverted/OLED contrast
            const fullImageData = ctx.getImageData(0, 0, width, height);
            let code = jsQR(fullImageData.data, fullImageData.width, fullImageData.height, {
              inversionAttempts: "attemptBoth",
            });

            // Pass 2: Center crop scan if full frame missed (focuses on target reticle)
            if (!code) {
              const cropSize = Math.round(Math.min(width, height) * 0.7);
              const cropX = Math.round((width - cropSize) / 2);
              const cropY = Math.round((height - cropSize) / 2);
              const cropImageData = ctx.getImageData(cropX, cropY, cropSize, cropSize);

              code = jsQR(cropImageData.data, cropImageData.width, cropImageData.height, {
                inversionAttempts: "attemptBoth",
              });
            }

            if (code && code.data) {
              handleDetectedText(code.data);
            }
          }
        }

        isProcessing = false;
      }

      if (!isCancelled) {
        animationFrameRef.current = requestAnimationFrame(scanFrame);
      }
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
      <div className="relative aspect-[4/3] w-full bg-black flex items-center justify-center overflow-hidden">
        {/* Flash Ping Effect */}
        {isDetectedFlash && (
          <div className="absolute inset-0 z-30 bg-emerald-400/35 transition-opacity duration-150 pointer-events-none" />
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
          <div className="relative h-56 w-56 sm:h-64 sm:w-64 rounded-2xl border-2 border-emerald-400/80 flex flex-col justify-between p-2.5 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            {/* Animated Laser Scanline */}
            <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse opacity-80 top-1/2 -translate-y-1/2" />

            <div className="flex justify-between">
              <span className="h-5 w-5 border-t-2 border-l-2 border-emerald-400 rounded-tl" />
              <span className="h-5 w-5 border-t-2 border-r-2 border-emerald-400 rounded-tr" />
            </div>
            <div className="text-center">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/80 px-2.5 py-0.5 text-[9px] font-mono font-bold text-emerald-300 backdrop-blur-sm border border-emerald-500/30">
                {isEngineNative ? (
                  <>
                    <Zap className="h-2.5 w-2.5 text-amber-400" />
                    HW ACCELERATED
                  </>
                ) : (
                  "OPTICAL RETICLE"
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="h-5 w-5 border-b-2 border-l-2 border-emerald-400 rounded-bl" />
              <span className="h-5 w-5 border-b-2 border-r-2 border-emerald-400 rounded-br" />
            </div>
          </div>
        </div>

        {/* Multi-frame chunk progress banner */}
        {chunkProgress && chunkProgress.total > 1 && (
          <div className="absolute bottom-3 inset-x-4 z-20 rounded-xl bg-background/95 backdrop-blur-md border border-emerald-500/40 p-2.5 text-foreground shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
              <div className="text-[11px] font-semibold">
                Captured Frame:{" "}
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {chunkProgress.current} of {chunkProgress.total}
                </span>
              </div>
            </div>
            <div className="text-[10px] font-mono font-bold bg-muted px-2 py-0.5 rounded-md">
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
              Paste Handshake SDP Directly
            </Button>
          </div>
        )}
      </div>

      {/* Bottom Option Bar */}
      <div className="p-2.5 bg-background border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          Hold camera steady at peer QR code
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
            placeholder="Paste DHR:Q:... or raw SDP payload here"
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

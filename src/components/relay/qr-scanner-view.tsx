import React, { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, FlipHorizontal, X, Keyboard, CheckCircle2, Upload, Sparkles, RefreshCw } from "lucide-react";
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
  // Stable unique element ID for Html5Qrcode container
  const containerId = useRef(`html5qr-container-${Math.random().toString(36).substring(2, 9)}`).current;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const collectorRef = useRef<QRChunkCollector>(new QRChunkCollector());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDetectedFlash, setIsDetectedFlash] = useState<boolean>(false);
  const [isManualInputOpen, setIsManualInputOpen] = useState<boolean>(false);
  const [manualText, setManualText] = useState<string>("");

  const handleDetectedText = useCallback(
    (text: string) => {
      if (!text) return;
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

        // Cleanly stop scanner before notifying parent
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              scannerRef.current.stop().catch(() => {});
            }
          } catch {
            // ignore
          }
        }
        onScanComplete(feedResult.data);
      }
    },
    [onScanComplete]
  );

  // Initialize Html5Qrcode scanner lifecycle
  useEffect(() => {
    let isMounted = true;
    collectorRef.current.reset();
    setIsInitializing(true);
    setCameraError(null);

    const initScanner = async () => {
      try {
        // Ensure DOM container is present
        const container = document.getElementById(containerId);
        if (!container) return;

        // Clean up any existing scanner instance
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              await scannerRef.current.stop();
            }
            scannerRef.current.clear();
          } catch {
            // ignore
          }
          scannerRef.current = null;
        }

        if (!isMounted) return;

        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });

        scannerRef.current = scanner;

        // Start optical camera scanning using html5-qrcode
        await scanner.start(
          { facingMode },
          {
            fps: 20,
            aspectRatio: 1.333333,
            disableFlip: facingMode === "environment",
          },
          (decodedText: string) => {
            if (isMounted) {
              handleDetectedText(decodedText);
            }
          },
          () => {
            // Non-matching frames are expected, no action needed
          }
        );

        if (isMounted) {
          setIsInitializing(false);
        }
      } catch (err) {
        if (!isMounted) return;
        setIsInitializing(false);
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : "Camera permission denied or camera device unavailable.";
        setCameraError(msg);
      }
    };

    initScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        try {
          if (scanner.isScanning) {
            scanner.stop().then(() => scanner.clear()).catch(() => {});
          } else {
            scanner.clear();
          }
        } catch {
          // ignore
        }
      }
    };
  }, [containerId, facingMode, handleDetectedText]);

  const toggleFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Use Html5Qrcode static or instance scanFile
      let resultText = "";
      if (scannerRef.current) {
        resultText = await scannerRef.current.scanFile(file, true);
      } else {
        const tempScanner = new Html5Qrcode(containerId);
        resultText = await tempScanner.scanFile(file, false);
      }

      if (resultText) {
        handleDetectedText(resultText);
      }
    } catch (err) {
      alert("No valid QR code found in the selected image file.");
      console.warn("File scan error:", err);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;

    const feedResult = collectorRef.current.feed(manualText.trim());
    if (feedResult.isComplete && feedResult.data) {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
      onScanComplete(feedResult.data);
    } else if (feedResult.progress.total > 1) {
      setChunkProgress(feedResult.progress);
      setManualText("");
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-black text-white shadow-xl flex flex-col">
      {/* Hidden File Input for Image Scanning */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Top Header */}
      <div className="relative z-20 flex items-center justify-between p-3.5 bg-background/85 backdrop-blur-md border-b border-border/50">
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
            onClick={() => fileInputRef.current?.click()}
            title="Scan from photo/screenshot"
            className="h-7 w-7 p-0 rounded-full text-foreground hover:bg-muted"
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
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
        {/* Flash Ping Effect on Scan */}
        {isDetectedFlash && (
          <div className="absolute inset-0 z-30 bg-emerald-400/35 transition-opacity duration-150 pointer-events-none" />
        )}

        {/* html5-qrcode video container */}
        <div
          id={containerId}
          className="w-full h-full relative overflow-hidden flex items-center justify-center [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
        />

        {/* Loading Spinner */}
        {isInitializing && !cameraError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 gap-2">
            <RefreshCw className="h-6 w-6 text-emerald-400 animate-spin" />
            <span className="text-xs text-muted-foreground font-mono">Initializing camera engine...</span>
          </div>
        )}

        {/* Custom Reticle / Optical Target Overlay */}
        {!isInitializing && !cameraError && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative h-56 w-56 sm:h-64 sm:w-64 rounded-2xl border-2 border-emerald-400/80 flex flex-col justify-between p-2.5 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              {/* Animated Laser Scanline */}
              <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse opacity-85 top-1/2 -translate-y-1/2" />

              <div className="flex justify-between">
                <span className="h-5 w-5 border-t-2 border-l-2 border-emerald-400 rounded-tl" />
                <span className="h-5 w-5 border-t-2 border-r-2 border-emerald-400 rounded-tr" />
              </div>
              <div className="text-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-black/80 px-2.5 py-0.5 text-[9px] font-mono font-bold text-emerald-300 backdrop-blur-sm border border-emerald-500/30">
                  <Sparkles className="h-2.5 w-2.5 text-emerald-400" />
                  OPTICAL SCANNER ACTIVE
                </span>
              </div>
              <div className="flex justify-between">
                <span className="h-5 w-5 border-b-2 border-l-2 border-emerald-400 rounded-bl" />
                <span className="h-5 w-5 border-b-2 border-r-2 border-emerald-400 rounded-br" />
              </div>
            </div>
          </div>
        )}

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
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full text-xs gap-1.5"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload QR Image
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsManualInputOpen(true)}
                className="rounded-full text-xs gap-1.5"
              >
                <Keyboard className="h-3.5 w-3.5" />
                Paste SDP Text
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Option Bar */}
      <div className="p-2.5 bg-background border-t border-border flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          Aim camera directly at peer QR code
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="text-[10px] h-6 rounded-md gap-1 text-muted-foreground hover:text-foreground"
          >
            <Upload className="h-3 w-3" />
            Upload Image
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setIsManualInputOpen(!isManualInputOpen)}
            className="text-[10px] h-6 rounded-md gap-1 text-muted-foreground hover:text-foreground"
          >
            <Keyboard className="h-3 w-3" />
            Manual
          </Button>
        </div>
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

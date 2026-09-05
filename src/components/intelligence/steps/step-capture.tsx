import React, { useEffect, useRef } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  RotateCcw,
  Smartphone,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScenarioId } from "../config/scenario-config";
import { ScenarioPresetGrid } from "../components/scenario-preset-grid";

export interface StepCaptureProps {
  cameraStream: MediaStream | null;
  isCameraActive: boolean;
  isFlashing: boolean;
  previewImageUrl: string | null;
  capturedBitmap: ImageBitmap | null;
  activeScenarioId: string | null;
  cameraError: string | null;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onToggleCameraFacing: () => void;
  onCaptureCamera: (video: HTMLVideoElement) => void;
  onPhotoFile: (file: File, sourceId: string) => void;
  onSelectPreset: (id: ScenarioId) => void;
  onClearPhoto: () => void;
  onProceed: () => void;
}

export const StepCapture: React.FC<StepCaptureProps> = ({
  cameraStream,
  isCameraActive,
  isFlashing,
  previewImageUrl,
  capturedBitmap,
  activeScenarioId,
  cameraError,
  // onStartCamera,
  onStopCamera,
  onToggleCameraFacing,
  onCaptureCamera,
  onPhotoFile,
  onSelectPreset,
  onClearPhoto,
  onProceed,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Connect active camera stream to video element
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch((err) => {
        console.warn("Video playback prevented:", err);
      });
    }
  }, [cameraStream, isCameraActive]);

  const handleCaptureClick = () => {
    if (videoRef.current) {
      onCaptureCamera(videoRef.current);
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden Mobile Native Camera & File Upload Inputs */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPhotoFile(file, "device-camera");
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPhotoFile(file, "uploaded-photo");
        }}
      />

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        {/* Camera Viewfinder Box */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/95 flex items-center justify-center">
          {/* Visual Shutter Flash */}
          {isFlashing && (
            <div className="absolute inset-0 z-30 bg-white/90 transition-opacity duration-200 pointer-events-none" />
          )}

          {/* Video Element for In-App Stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${isCameraActive ? "block" : "hidden"}`}
          />

          {isCameraActive ? (
            <>
              {/* Reticle / Crosshair Overlay */}
              <div className="absolute inset-4 pointer-events-none border border-white/25 rounded-lg flex flex-col justify-between p-2">
                <div className="flex justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-600/90 text-white px-2 py-0.5 rounded-full shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                    LIVE CAMERA
                  </span>
                </div>
                <div className="self-center h-12 w-12 border-2 border-emerald-400/60 rounded-full flex items-center justify-center">
                  <div className="h-2 w-2 bg-emerald-400 rounded-full" />
                </div>
                <div className="text-[10px] text-white/70 text-center font-mono">
                  Align hazard in frame & hold still
                </div>
              </div>

              {/* Top Floating Controls */}
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={onToggleCameraFacing}
                  className="rounded-full shadow-md text-xs font-semibold backdrop-blur-md bg-black/50 text-white hover:bg-black/70 border border-white/20"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Flip
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={onStopCamera}
                  className="rounded-full shadow-md text-xs font-semibold"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Shutter Button */}
              <div className="absolute bottom-3 inset-x-0 flex justify-center z-20">
                <button
                  onClick={handleCaptureClick}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold shadow-2xl rounded-full px-6 py-2.5 text-xs border-2 border-white/40 transition-transform"
                >
                  <Camera className="h-4 w-4" /> Snap Hazard Photo
                </button>
              </div>
            </>
          ) : previewImageUrl ? (
            /* Selected Photo Preview */
            <div className="relative h-full w-full">
              <img
                src={previewImageUrl}
                alt="Selected Hazard Frame"
                className="h-full w-full object-cover"
              />
              <div className="absolute top-2.5 left-2.5 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 border border-emerald-500/40 flex items-center gap-1 shadow-md">
                <Check className="h-3.5 w-3.5" /> Photo Selected
              </div>
              <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={onClearPhoto}
                  className="rounded-full shadow-md text-xs font-semibold backdrop-blur-md bg-black/60 text-white hover:bg-black/80 border border-white/20"
                >
                  Retake
                </Button>
              </div>
            </div>
          ) : (
            /* Empty Viewfinder Prompt & Capture CTAs */
            <div className="text-center p-6 space-y-3 z-10">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Camera className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Capture Field Slope Hazard
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Snap live with mobile camera or choose a corridor preset below
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="rounded-full text-xs font-semibold shadow-sm gap-1.5"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Native Camera
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full text-xs font-semibold shadow-sm gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Camera Error Message */}
        {cameraError && (
          <div className="p-2.5 bg-amber-500/10 border-t border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-400 flex items-center justify-between">
            <span>{cameraError}</span>
            <Button
              size="xs"
              variant="outline"
              onClick={() => nativeCameraInputRef.current?.click()}
              className="text-[10px] h-6 shrink-0 ml-2"
            >
              Use Device Camera
            </Button>
          </div>
        )}

        {/* Preset Presets Grid */}
        <ScenarioPresetGrid
          selectedId={activeScenarioId}
          onSelect={onSelectPreset}
        />
      </div>

      {/* Advance to Step 2 */}
      <Button
        size="lg"
        className="w-full bg-primary text-primary-foreground font-bold shadow-md h-12 text-sm rounded-xl gap-2"
        disabled={!capturedBitmap || isCameraActive}
        onClick={onProceed}
      >
        <span>Next: Confirm Location & Language</span>
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
};

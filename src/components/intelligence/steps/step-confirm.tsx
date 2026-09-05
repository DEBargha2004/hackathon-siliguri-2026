import React from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  Eye,
  MessageSquareCode,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HazardPhotoCard } from "../components/hazard-photo-card";

export interface StepConfirmProps {
  previewImageUrl: string | null;
  friendlyLandmark: string;
  isProcessing: boolean;
  activeProcessingStage?: "vision" | "fusion" | "advisory" | null;
  loadingProgress?: number;
  loadingStage?: string;
  onRunAnalysis: () => void;
  onRetake: () => void;
}

export const StepConfirm: React.FC<StepConfirmProps> = ({
  previewImageUrl,
  friendlyLandmark,
  isProcessing,
  activeProcessingStage,
  loadingProgress,
  loadingStage,
  onRunAnalysis,
  onRetake,
}) => {
  return (
    <div className="space-y-4">
      {/* Photo Confirmation Card */}
      <HazardPhotoCard
        imageUrl={previewImageUrl}
        landmarkLabel={friendlyLandmark}
        onChangePhoto={onRetake}
      />

      {/* Stepped Processing Indicator shown when analysis is running */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/30 bg-card/95 p-3 space-y-2.5 shadow-md backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
              On-Device Inference Pipeline Active
            </span>
            <span className="text-[10px] font-mono font-bold text-primary px-1.5 py-0.5 bg-primary/10 rounded">
              {loadingProgress ? Math.min(100, Math.round(loadingProgress)) : 25}%
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            {/* Stage 1: Vision Model */}
            <div
              className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                activeProcessingStage === "vision"
                  ? "bg-sky-500/10 border-sky-500/40 text-sky-600 dark:text-sky-300 font-bold"
                  : activeProcessingStage === "fusion" || activeProcessingStage === "advisory"
                  ? "bg-muted/40 border-border/50 text-muted-foreground"
                  : "bg-background border-border/60 text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[11px]">1. Vision Classifier (MobileNetV4)</span>
              </div>
              {activeProcessingStage === "vision" ? (
                <RefreshCw className="h-3 w-3 animate-spin text-sky-500" />
              ) : activeProcessingStage === "fusion" || activeProcessingStage === "advisory" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <span className="text-[9px] text-muted-foreground font-mono">Queued</span>
              )}
            </div>

            {/* Stage 2: Context Fusion */}
            <div
              className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                activeProcessingStage === "fusion"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-300 font-bold"
                  : activeProcessingStage === "advisory"
                  ? "bg-muted/40 border-border/50 text-muted-foreground"
                  : "bg-background border-border/60 text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <Compass className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[11px]">2. Context & Sensor Fusion</span>
              </div>
              {activeProcessingStage === "fusion" ? (
                <RefreshCw className="h-3 w-3 animate-spin text-amber-500" />
              ) : activeProcessingStage === "advisory" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <span className="text-[9px] text-muted-foreground font-mono">Queued</span>
              )}
            </div>

            {/* Stage 3: LLM Advisory Engine */}
            <div
              className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                activeProcessingStage === "advisory"
                  ? "bg-purple-500/10 border-purple-500/40 text-purple-600 dark:text-purple-300 font-bold"
                  : "bg-background border-border/60 text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <MessageSquareCode className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[11px]">3. Multilingual Advisory Engine (4-Locale)</span>
              </div>
              {activeProcessingStage === "advisory" ? (
                <RefreshCw className="h-3 w-3 animate-spin text-purple-500" />
              ) : (
                <span className="text-[9px] text-muted-foreground font-mono">Queued</span>
              )}
            </div>
          </div>

          {loadingStage && (
            <p className="text-[10px] text-muted-foreground text-center truncate italic">
              {loadingStage}
            </p>
          )}
        </div>
      )}

      {/* Primary Action Button */}
      <Button
        size="lg"
        className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-extrabold shadow-lg h-12 text-sm rounded-xl gap-2 transition-transform"
        disabled={isProcessing}
        onClick={onRunAnalysis}
      >
        {isProcessing ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Analyzing Hazard (Dual AI Active)...</span>
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            <span>Analyze Hazard & Get Directive</span>
          </>
        )}
      </Button>

      {/* Retake Action */}
      <Button
        size="sm"
        variant="ghost"
        disabled={isProcessing}
        className="w-full text-xs text-muted-foreground hover:text-foreground gap-1"
        onClick={onRetake}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Retake Photo</span>
      </Button>
    </div>
  );
};

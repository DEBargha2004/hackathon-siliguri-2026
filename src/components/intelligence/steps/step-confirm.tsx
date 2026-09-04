import React from "react";
import { ArrowLeft, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HazardPhotoCard } from "../components/hazard-photo-card";

export interface StepConfirmProps {
  previewImageUrl: string | null;
  friendlyLandmark: string;
  isProcessing: boolean;
  onRunAnalysis: () => void;
  onRetake: () => void;
}

export const StepConfirm: React.FC<StepConfirmProps> = ({
  previewImageUrl,
  friendlyLandmark,
  isProcessing,
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
            <span>Analyzing Slope Hazard...</span>
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
        className="w-full text-xs text-muted-foreground hover:text-foreground gap-1"
        onClick={onRetake}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Retake Photo</span>
      </Button>
    </div>
  );
};

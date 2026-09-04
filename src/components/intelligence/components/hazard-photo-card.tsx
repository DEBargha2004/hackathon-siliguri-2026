import React from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface HazardPhotoCardProps {
  imageUrl: string | null;
  landmarkLabel: string;
  onChangePhoto: () => void;
}

export const HazardPhotoCard: React.FC<HazardPhotoCardProps> = ({
  imageUrl,
  landmarkLabel,
  onChangePhoto,
}) => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-black shadow-md aspect-[16/10]">
      {imageUrl && (
        <img
          src={imageUrl}
          alt="Hazard Frame for Review"
          className="h-full w-full object-cover"
        />
      )}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 flex items-center justify-between text-white">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <MapPin className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">{landmarkLabel}</span>
        </div>
        <Button
          size="xs"
          variant="secondary"
          onClick={onChangePhoto}
          className="text-xs bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md rounded-full px-3 py-1 shadow-sm shrink-0"
        >
          Change Photo
        </Button>
      </div>
    </div>
  );
};

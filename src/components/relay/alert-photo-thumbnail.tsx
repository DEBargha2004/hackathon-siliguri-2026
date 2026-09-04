import React, { useState, useEffect } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import { ensureBlob } from "@/lib/relay/alert-store";

export interface AlertPhotoThumbnailProps {
  blob: Blob;
  hazardType: string;
  className?: string;
}

export const AlertPhotoThumbnail: React.FC<AlertPhotoThumbnailProps> = ({
  blob,
  hazardType,
  className = "relative w-full sm:w-44 sm:min-w-[11rem] h-44 sm:h-auto bg-black/90 shrink-0",
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    setHasError(false);
    let activeUrl: string | null = null;

    try {
      const safeBlob = ensureBlob(blob);
      if (safeBlob && safeBlob.size > 0) {
        activeUrl = URL.createObjectURL(safeBlob);
        setImageUrl(activeUrl);
      } else {
        setImageUrl(null);
      }
    } catch (err) {
      console.warn("Failed to create object URL for photo blob:", err);
      setImageUrl(null);
    }

    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [blob]);

  return (
    <div className={className}>
      {imageUrl && !hasError ? (
        <img
          src={imageUrl}
          alt={`Official Evidence for ${hazardType}`}
          onError={() => setHasError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="h-full w-full min-h-[10rem] flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 text-slate-400 p-4 text-center">
          <div className="h-10 w-10 rounded-full bg-slate-700/50 flex items-center justify-center mb-2">
            <Camera className="h-5 w-5 text-slate-300" />
          </div>
          <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
            {hazardType.replace(/_/g, " ")}
          </span>
          <span className="text-[9px] text-slate-500 mt-0.5">Evidence Snapshot</span>
        </div>
      )}

      <span className="absolute bottom-2 left-2 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-mono font-semibold text-white/90 backdrop-blur-sm shadow-sm flex items-center gap-1">
        <ImageIcon className="h-2.5 w-2.5 text-emerald-400" />
        Evidence Photo
      </span>
    </div>
  );
};

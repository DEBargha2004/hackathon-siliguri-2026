import React from "react";
import type { Severity } from "@/types/intelligence";
import { getSeverityPresentation } from "../config/severity-config";

export interface SeverityBannerProps {
  severity: Severity;
  confidence: number;
  landmarkLabel?: string | null;
}

export const SeverityBanner: React.FC<SeverityBannerProps> = ({
  severity,
  confidence,
  landmarkLabel,
}) => {
  const presentation = getSeverityPresentation(severity);
  const Icon = presentation.icon;

  return (
    <div
      className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-white font-bold shadow-sm ${presentation.gradientClass}`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 shrink-0" />
        <div className="flex flex-col">
          <span className="text-sm uppercase tracking-wider font-extrabold">
            {presentation.title}
          </span>
          <span className="text-[10px] opacity-90 font-medium">
            {landmarkLabel ?? "DHR Corridor"}
          </span>
        </div>
      </div>

      <span className="text-xs font-mono bg-black/25 px-2 py-0.5 rounded">
        {Math.round(confidence * 100)}% Conf
      </span>
    </div>
  );
};

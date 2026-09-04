import React from "react";
import { CheckCircle2 } from "lucide-react";
import { SCENARIO_PRESETS, type ScenarioId } from "../config/scenario-config";

export interface ScenarioPresetGridProps {
  selectedId: string | null;
  onSelect: (id: ScenarioId) => void;
}

export const ScenarioPresetGrid: React.FC<ScenarioPresetGridProps> = ({
  selectedId,
  onSelect,
}) => {
  return (
    <div className="p-3.5 bg-muted/30 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
          Or Tap a Slope Hazard Preset:
        </span>
        {selectedId && (
          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> Preset Loaded
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {SCENARIO_PRESETS.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`flex flex-col text-left p-2.5 rounded-xl border transition-all ${
              selectedId === s.id
                ? "border-primary bg-primary/10 text-foreground shadow-xs ring-2 ring-primary/40"
                : "border-border/70 bg-card hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-xs font-bold text-foreground">{s.label}</span>
            <span className="text-[10px] opacity-75 truncate">{s.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

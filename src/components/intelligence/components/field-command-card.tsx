import React from "react";
import { ShieldAlert, Volume2, VolumeX } from "lucide-react";

export interface FieldCommandCardProps {
  command: string;
  isSpeaking: boolean;
  onToggleSpeech: () => void;
}

export const FieldCommandCard: React.FC<FieldCommandCardProps> = ({
  command,
  isSpeaking,
  onToggleSpeech,
}) => {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold text-destructive uppercase tracking-wider flex items-center gap-1">
          <ShieldAlert className="h-3.5 w-3.5" />
          FIELD COMMAND (ACTION REQUIRED NOW):
        </span>
        <button
          onClick={onToggleSpeech}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive hover:underline px-2 py-0.5 rounded bg-destructive/10 border border-destructive/20 transition-colors"
        >
          {isSpeaking ? (
            <>
              <VolumeX className="h-3 w-3" /> Stop
            </>
          ) : (
            <>
              <Volume2 className="h-3 w-3" /> Listen
            </>
          )}
        </button>
      </div>
      <p className="text-sm font-bold text-foreground leading-relaxed">"{command}"</p>
    </div>
  );
};

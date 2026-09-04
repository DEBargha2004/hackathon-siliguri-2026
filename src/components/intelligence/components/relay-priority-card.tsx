import React from "react";
import { Send } from "lucide-react";
import type { RelayPriority } from "@/types/intelligence";
import { getRelayPresentation } from "../config/relay-config";

export interface RelayPriorityCardProps {
  priority: RelayPriority;
}

export const RelayPriorityCard: React.FC<RelayPriorityCardProps> = ({ priority }) => {
  const presentation = getRelayPresentation(priority);

  return (
    <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3 border border-border">
      <div className="flex items-center gap-2 text-xs">
        <Send className={`h-4 w-4 ${presentation.iconClass}`} />
        <div className="flex flex-col">
          <span className="font-bold text-foreground">{presentation.title}</span>
          <span className="text-[10px] text-muted-foreground">{presentation.subtitle}</span>
        </div>
      </div>

      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${presentation.badgeClass}`}>
        {presentation.badgeText}
      </span>
    </div>
  );
};

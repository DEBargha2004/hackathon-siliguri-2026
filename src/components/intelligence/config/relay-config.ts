import type { RelayPriority } from "@/types/intelligence";

export interface RelayPresentation {
  priority: RelayPriority;
  title: string;
  subtitle: string;
  badgeText: string;
  badgeClass: string;
  iconClass: string;
}

export const RELAY_PRESENTATION: Record<RelayPriority, RelayPresentation> = {
  BROADCAST_IMMEDIATE: {
    priority: "BROADCAST_IMMEDIATE",
    title: "BROADCAST TO STATION MASTER",
    subtitle: "Immediate action • Alert oncoming trains",
    badgeText: "BROADCAST_IMMEDIATE",
    badgeClass: "bg-red-600 text-white shadow-xs",
    iconClass: "text-red-500 animate-bounce",
  },
  LOG_ONLY: {
    priority: "LOG_ONLY",
    title: "LOG IN LOCAL PATROL RECORD",
    subtitle: "Recorded locally • Routine inspection",
    badgeText: "LOG_ONLY",
    badgeClass: "bg-muted text-muted-foreground border border-border",
    iconClass: "text-muted-foreground",
  },
};

export function getRelayPresentation(priority: RelayPriority): RelayPresentation {
  return RELAY_PRESENTATION[priority] ?? RELAY_PRESENTATION.LOG_ONLY;
}

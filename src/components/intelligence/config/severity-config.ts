import type { ComponentType } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Severity } from "@/types/intelligence";

export interface SeverityPresentation {
  severity: Severity;
  title: string;
  icon: ComponentType<{ className?: string }>;
  gradientClass: string;
  badgeClass: string;
}

export const SEVERITY_PRESENTATION: Record<Severity, SeverityPresentation> = {
  CRITICAL: {
    severity: "CRITICAL",
    title: "CRITICAL HAZARD DETECTED",
    icon: AlertOctagon,
    gradientClass: "bg-gradient-to-r from-red-600 to-rose-700 animate-pulse",
    badgeClass: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
  },
  WARNING: {
    severity: "WARNING",
    title: "HAZARD WARNING",
    icon: AlertTriangle,
    gradientClass: "bg-gradient-to-r from-amber-500 to-orange-600",
    badgeClass: "bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  MONITOR: {
    severity: "MONITOR",
    title: "MONITOR & RECORD",
    icon: CheckCircle2,
    gradientClass: "bg-gradient-to-r from-emerald-600 to-teal-700",
    badgeClass: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
};

export function getSeverityPresentation(severity: Severity): SeverityPresentation {
  return SEVERITY_PRESENTATION[severity] ?? SEVERITY_PRESENTATION.MONITOR;
}

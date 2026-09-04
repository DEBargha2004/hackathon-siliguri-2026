import React from "react";
import { Globe } from "lucide-react";
import type { Locale } from "@/types/intelligence";
import { SUPPORTED_LOCALES } from "../config/locale-config";

export interface LocaleSelectorProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  variant?: "detailed" | "compact";
  label?: string;
}

export const LocaleSelector: React.FC<LocaleSelectorProps> = ({
  value,
  onChange,
  variant = "detailed",
  label = "Emergency Advisory Language:",
}) => {
  if (variant === "compact") {
    return (
      <div className="flex items-center justify-between text-xs">
        <span className="text-[11px] text-muted-foreground font-semibold">Language:</span>
        <div className="flex gap-1">
          {SUPPORTED_LOCALES.map((item) => (
            <button
              key={item.code}
              onClick={() => onChange(item.code)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                value === item.code
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm space-y-2">
      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
        <Globe className="h-3.5 w-3.5 text-primary" />
        {label}
      </span>
      <div className="grid grid-cols-4 gap-1.5">
        {SUPPORTED_LOCALES.map((item) => (
          <button
            key={item.code}
            onClick={() => onChange(item.code)}
            className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all ${
              value === item.code
                ? "border-primary bg-primary text-primary-foreground shadow-sm font-bold ring-2 ring-primary/30"
                : "border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="text-xs font-bold leading-tight">{item.label}</span>
            <span className="text-[9px] opacity-75">{item.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

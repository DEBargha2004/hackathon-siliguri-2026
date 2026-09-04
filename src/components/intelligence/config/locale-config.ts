import type { Locale } from "@/types/intelligence";

export interface LocaleConfig {
  code: Locale;
  label: string;
  sub: string;
  speechLang: string;
}

export const SUPPORTED_LOCALES: readonly LocaleConfig[] = [
  { code: "ne", label: "नेपाली", sub: "Nepali", speechLang: "ne-NP" },
  { code: "bn", label: "বাংলা", sub: "Bengali", speechLang: "bn-IN" },
  { code: "hi", label: "हिन्दी", sub: "Hindi", speechLang: "hi-IN" },
  { code: "en", label: "EN", sub: "English", speechLang: "en-IN" },
] as const;

export function getLocaleSpeechLang(locale: Locale): string {
  const match = SUPPORTED_LOCALES.find((l) => l.code === locale);
  return match?.speechLang ?? "en-IN";
}

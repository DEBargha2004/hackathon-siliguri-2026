export type ScenarioId = "crack" | "boulder" | "seepage" | "mud";

export interface ScenarioPreset {
  id: ScenarioId;
  label: string;
  desc: string;
  filename: string;
  imagePath: string;
  aliases: readonly string[];
  friendlyLandmark: string;
  telemetryKey: "tindharia" | "kurseong" | "paglaJhora" | "ghum";
}

export const SCENARIO_PRESETS: readonly ScenarioPreset[] = [
  {
    id: "crack",
    label: "⛰️ Wall Crack",
    desc: "Tindharia Wall Fracture",
    filename: "wall-crack.jpg",
    imagePath: "/presets/wall-crack.jpg",
    aliases: ["wall-crack", "crack", "wall"],
    friendlyLandmark: "Tindharia Section • DHR Corridor",
    telemetryKey: "tindharia",
  },
  {
    id: "boulder",
    label: "🪨 Track Boulder",
    desc: "Kurseong Rail Blockage",
    filename: "track-boulder.jpg",
    imagePath: "/presets/track-boulder.jpg",
    aliases: ["track-boulder", "boulder", "rock"],
    friendlyLandmark: "Kurseong Track Section • DHR Corridor",
    telemetryKey: "kurseong",
  },
  {
    id: "seepage",
    label: "💧 Torrent Flood",
    desc: "Pagla Jhora Seepage",
    filename: "torrent-flood.jpg",
    imagePath: "/presets/torrent-flood.jpg",
    aliases: ["torrent-flood", "torrent", "flood", "seepage"],
    friendlyLandmark: "Pagla Jhora Slide Zone • DHR Corridor",
    telemetryKey: "paglaJhora",
  },
  {
    id: "mud",
    label: "🌧️ Slope Slide",
    desc: "Ghum Hillside Mudslip",
    filename: "slope-slide.jpg",
    imagePath: "/presets/slope-slide.jpg",
    aliases: ["slope-slide", "slide", "mud", "landslide"],
    friendlyLandmark: "Ghum Hillside Ridge • DHR Corridor",
    telemetryKey: "ghum",
  },
] as const;

export function getFriendlyLocation(scenarioId: string | null, hasCoordinates: boolean): string {
  const match = SCENARIO_PRESETS.find((p) => p.id === scenarioId);
  if (match) return match.friendlyLandmark;
  if (scenarioId === "live-camera") return "Live Camera Snapshot • DHR Corridor";
  if (scenarioId === "device-camera") return "Device Camera Capture • DHR Corridor";
  if (scenarioId === "uploaded-photo") return "Field Photo • DHR Corridor";
  if (hasCoordinates) return "DHR Railway Corridor";
  return "Darjeeling Hill Corridor";
}

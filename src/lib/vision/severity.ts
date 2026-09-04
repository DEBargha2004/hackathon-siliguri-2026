import type {
  HazardType,
  Severity,
  VisualIndicators,
} from "../../types/intelligence";

/**
 * Derives severity strictly based on the rule table:
 * - CRITICAL: mud/rock on track or road, active slope movement, c >= 0.65
 * - WARNING: visible tension cracks, wall bulging, heavy localized seepage, c >= 0.50
 * - MONITOR: minor gravel drop, unblocked seepage, c < 0.50 or low-risk class
 */
export function deriveSeverity(
  hazardType: HazardType,
  confidence: number,
  indicators: VisualIndicators = {}
): Severity {
  // Check for critical criteria: rail blockage, active mudslide/collapse, or torrential flooding
  const isCriticalTrigger =
    indicators.rockOnTrack === true ||
    indicators.activeMovement === true ||
    (hazardType === "TRACK_ROAD_BLOCKAGE" && confidence >= 0.65) ||
    (hazardType === "WATER_SEEPAGE" && indicators.heavySeepage === true && confidence >= 0.75);

  if (isCriticalTrigger) {
    return "CRITICAL";
  }

  // Also if confidence is very high on landslide slip with active movement
  if (hazardType === "LANDSLIDE_SLIP" && confidence >= 0.75 && indicators.activeMovement === true) {
    return "CRITICAL";
  }

  // Check for warning criteria
  const isWarningTrigger =
    indicators.tensionCracks === true ||
    indicators.bulgingWall === true ||
    indicators.heavySeepage === true ||
    hazardType === "LANDSLIDE_SLIP" ||
    hazardType === "WATER_SEEPAGE";

  if (confidence >= 0.50 && isWarningTrigger) {
    return "WARNING";
  }

  // Monitor criteria: c < 0.50 or low risk class / minor gravel / unblocked
  return "MONITOR";
}

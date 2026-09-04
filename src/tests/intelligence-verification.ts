import {
  findNearestLandmark,
  fuseHazardContext,
} from "../lib/context/fusion";
import {
  getDeterministicAdvisory,
} from "../lib/llm/fallback-strings";
import { deriveSeverity } from "../lib/vision/severity";
import type { HazardType, Locale, Severity } from "../types/intelligence";

console.log("=== RUNNING ON-DEVICE INTELLIGENCE SUB-SYSTEM SELF-VERIFICATION ===");

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// ----------------------------------------------------
// 1. Module A: Severity Derivation Tests
// ----------------------------------------------------
console.log("\n[1] Module A — Severity Scoring Rules Verification");

const s1 = deriveSeverity("TRACK_ROAD_BLOCKAGE", 0.75, { rockOnTrack: true });
assert(s1 === "CRITICAL", `TRACK_ROAD_BLOCKAGE with c=0.75 is CRITICAL (got ${s1})`);

const s2 = deriveSeverity("LANDSLIDE_SLIP", 0.72, { tensionCracks: true, bulgingWall: true });
assert(s2 === "WARNING", `LANDSLIDE_SLIP with c=0.72 & tensionCracks is WARNING (got ${s2})`);

const s3 = deriveSeverity("WATER_SEEPAGE", 0.45, { blockedDrain: false });
assert(s3 === "MONITOR", `WATER_SEEPAGE with c=0.45 is MONITOR (got ${s3})`);

const s4 = deriveSeverity("LANDSLIDE_SLIP", 0.85, { activeMovement: true });
assert(s4 === "CRITICAL", `Active slope movement with c=0.85 is CRITICAL (got ${s4})`);

// ----------------------------------------------------
// 2. Module B: Context Fusion & DHR Geo Corridor Lookup
// ----------------------------------------------------
console.log("\n[2] Module B — Context Fusion & Offline DHR Landmark Proximity");

// Test Tindharia Workshop proximity (26.8550, 88.3325)
const landmarkTindharia = findNearestLandmark(26.8552, 88.3327);
assert(landmarkTindharia !== null, "Found nearest landmark near Tindharia");
assert(
  landmarkTindharia?.name.includes("Tindharia") === true,
  `Landmark is Tindharia (got: ${landmarkTindharia?.name})`
);
assert(
  landmarkTindharia ? landmarkTindharia.distanceMeters < 100 : false,
  `Distance is close < 100m (got: ${landmarkTindharia?.distanceMeters}m)`
);

// Test Batasia Loop proximity (27.0168, 88.2528)
const landmarkBatasia = findNearestLandmark(27.017, 88.253);
assert(
  landmarkBatasia?.name.includes("Batasia") === true,
  `Landmark near Batasia Loop detected (got: ${landmarkBatasia?.name})`
);

// Test Graceful Degradation with null coordinates
const contextNull = fuseHazardContext("LANDSLIDE_SLIP", "WARNING", 0.72, {
  coordinates: null,
  elevationMeters: null,
  bearing: null,
  timestamp: 1725470000000,
});
assert(contextNull.proximityLandmark === null, "Graceful null landmark when coordinates absent");
assert(contextNull.telemetry.coordinates === null, "Graceful null coordinates in payload");
assert(contextNull.severity === "WARNING", "Fused severity preserved");

// Test Exact Payload Shape conforming to prompt
const contextFull = fuseHazardContext("LANDSLIDE_SLIP", "CRITICAL", 0.82, {
  coordinates: [26.9854, 88.2721],
  elevationMeters: 1450,
  bearing: 312,
  timestamp: 1725470000000,
});
assert(contextFull.hazardType === "LANDSLIDE_SLIP", "Hazard type match");
assert(contextFull.severity === "CRITICAL", "Severity match");
assert(contextFull.visionConfidence === 0.82, "Vision confidence match");
assert(contextFull.telemetry.coordinates?.[0] === 26.9854, "Lat match");
assert(contextFull.telemetry.coordinates?.[1] === 88.2721, "Lon match");
assert(contextFull.telemetry.elevationMeters === 1450, "Elevation match");
assert(contextFull.telemetry.bearing === 312, "Bearing match");
assert(contextFull.proximityLandmark != null, "Proximity landmark attached");

// ----------------------------------------------------
// 3. Module C: Tier 3 Localized Strings (All 36 Combinations)
// ----------------------------------------------------
console.log("\n[3] Module C — 36 Pre-compiled Localized Advisory Combinations");

const hazardTypes: HazardType[] = ["LANDSLIDE_SLIP", "TRACK_ROAD_BLOCKAGE", "WATER_SEEPAGE"];
const severities: Severity[] = ["CRITICAL", "WARNING", "MONITOR"];
const locales: Locale[] = ["ne", "bn", "hi", "en"];

let tableCount = 0;
let validSchemas = 0;

for (const ht of hazardTypes) {
  for (const sev of severities) {
    for (const loc of locales) {
      tableCount++;
      const advisory = getDeterministicAdvisory(ht, sev, loc);

      // Verify schema
      const words = advisory.hazardLabel.trim().split(/\s+/);
      const isWordCountValid = words.length <= 5;
      const hasAction = advisory.immediateAction.length > 0;
      const isPriorityValid =
        advisory.relayPriority === "BROADCAST_IMMEDIATE" || advisory.relayPriority === "LOG_ONLY";

      if (isWordCountValid && hasAction && isPriorityValid) {
        validSchemas++;
      } else {
        console.error(`Invalid schema for ${ht}/${sev}/${loc}:`, advisory);
      }
    }
  }
}

assert(tableCount === 36, `Exactly 36 combinations verified (count: ${tableCount})`);
assert(validSchemas === 36, `All 36 advisories strictly satisfy schema constraints`);

// Verify Nepali Hill Dialect Output
const nepaliWarning = getDeterministicAdvisory("LANDSLIDE_SLIP", "WARNING", "ne");
assert(
  nepaliWarning.hazardLabel === "ढलानमा गम्भीर चिरा र धाँजा",
  `Nepali warning label verified: "${nepaliWarning.hazardLabel}"`
);
assert(
  nepaliWarning.immediateAction.includes("भित्तोमुनि"),
  `Nepali imperative command verified: "${nepaliWarning.immediateAction}"`
);

// Verify Bengali Output
const bengaliCritical = getDeterministicAdvisory("TRACK_ROAD_BLOCKAGE", "CRITICAL", "bn");
assert(
  bengaliCritical.hazardLabel === "রেললাইনে বিশালাকার বোল্ডার প্রতিবন্ধকতা",
  `Bengali critical label verified: "${bengaliCritical.hazardLabel}"`
);
assert(
  bengaliCritical.relayPriority === "BROADCAST_IMMEDIATE",
  "Critical blockage has BROADCAST_IMMEDIATE priority"
);

// Verify Deterministic Latency < 10ms
const t0 = performance.now();
for (let i = 0; i < 1000; i++) {
  getDeterministicAdvisory("LANDSLIDE_SLIP", "CRITICAL", "ne");
}
const avgMs = (performance.now() - t0) / 1000;
assert(avgMs < 0.1, `Tier 3 average lookup time is < 0.1ms (got: ${avgMs.toFixed(4)}ms)`);

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log(`\n=== VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
if (failed > 0) {
  process.exit(1);
}

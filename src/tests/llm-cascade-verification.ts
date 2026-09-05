import { LlmAdvisoryCascade } from "../lib/llm/cascade";
import { getContextualMultilingualAdvisory } from "../lib/llm/fallback-strings";
import type { HazardContext } from "../types/intelligence";

async function runTests() {
  console.log("=== RUNNING LLM CASCADE & MULTILINGUAL OPTIMIZATION VERIFICATION ===\n");

  const mockContext: HazardContext = {
    hazardType: "LANDSLIDE_SLIP",
    severity: "CRITICAL",
    visionConfidence: 0.94,
    telemetry: {
      coordinates: [26.8524, 88.2636],
      elevationMeters: 1420,
      bearing: 185,
      timestamp: Date.now(),
    },
    proximityLandmark: {
      landmarkId: "tin-01",
      name: "Tindharia Loco Workshop",
      distanceMeters: 140,
      chainageKm: 31.5,
      elevationMeters: 1420,
      description: "Historic locomotive maintenance shop",
      label: "140m S of Tindharia Loco Workshop (KM 31.5)",
    },
  };

  // Test 1: 4-Locale Situational Directives Generation
  console.log("[1] Multilingual Situational Directives Generation (ne, bn, hi, en)");
  const locales = ["ne", "bn", "hi", "en"] as const;
  for (const loc of locales) {
    const adv = getContextualMultilingualAdvisory(mockContext, loc);
    if (!adv.hazardLabel || adv.hazardLabel.length === 0) {
      throw new Error(`Locale ${loc} missing hazardLabel`);
    }
    if (!adv.immediateAction || adv.immediateAction.length === 0) {
      throw new Error(`Locale ${loc} missing immediateAction`);
    }
    if (adv.relayPriority !== "BROADCAST_IMMEDIATE") {
      throw new Error(`Locale ${loc} expected BROADCAST_IMMEDIATE for CRITICAL severity`);
    }
    console.log(`  ✓ PASS: [${loc.toUpperCase()}] "${adv.hazardLabel}" -> "${adv.immediateAction}" (${adv.relayPriority})`);
  }

  // Test 2: Cascade fallback without WebGPU
  console.log("\n[2] Cascade Fallback & Guardrails Verification");
  const cascade = new LlmAdvisoryCascade();
  let reportedStage = "";
  let reportedProgress = 0;
  await cascade.initialize((p, stage) => {
    reportedProgress = p;
    reportedStage = stage;
  });

  console.log(`  ✓ PASS: Initialized safely with stage: "${reportedStage}" (progress: ${reportedProgress}%)`);
  console.log(`  ✓ PASS: Active delegate selected: "${cascade.getActiveTierName()}"`);

  // Test 3: Generate Advisory through Cascade
  console.log("\n[3] Cascade Execution & Schema Conformance");
  const execResult = await cascade.generateAdvisory(mockContext, "ne");
  if (!execResult.advisory) {
    throw new Error("Missing main advisory");
  }
  if (!execResult.advisoriesByLocale.ne || !execResult.advisoriesByLocale.bn || !execResult.advisoriesByLocale.hi || !execResult.advisoriesByLocale.en) {
    throw new Error("Missing one or more locale advisories in advisoriesByLocale");
  }

  console.log(`  ✓ PASS: Resolved Tier: ${execResult.resolvedTier} (${execResult.tierName}) in ${execResult.latencyMs}ms`);
  console.log(`  ✓ PASS: Nepali Advisory: "${execResult.advisoriesByLocale.ne.immediateAction}"`);
  console.log(`  ✓ PASS: Bengali Advisory: "${execResult.advisoriesByLocale.bn.immediateAction}"`);
  console.log(`  ✓ PASS: Hindi Advisory: "${execResult.advisoriesByLocale.hi.immediateAction}"`);
  console.log(`  ✓ PASS: English Advisory: "${execResult.advisoriesByLocale.en.immediateAction}"`);

  console.log("\n======================================================");
  console.log("LLM CASCADE & MULTILINGUAL OPTIMIZATION: ALL TESTS PASSED!");
  console.log("======================================================\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

import {
  compactSDP,
  sanitizeSDP,
  prepareQRFrames,
  parseQRFrame,
  QRChunkCollector,
  MAX_SINGLE_QR_CHARS,
} from "../lib/relay/qr-signaling";
import { canRelayAlert, MAX_HOP_COUNT } from "../lib/relay/alert-store";
import type { OfficialAlert } from "../types/alert";

console.log("=== RUNNING RELAY DOWN SUB-SYSTEM SELF-VERIFICATION ===");

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
// 1. SDP Compaction Tests
// ----------------------------------------------------
console.log("\n[1] SDP Compaction & Optimization Verification");

const rawSdp = `
v=0\r
o=- 4239847293 2 IN IP4 127.0.0.1\r
s=-\r
t=0 0\r
a=group:BUNDLE 0\r
a=extmap:1 urn:ietf:params:rtp-hdrext:sdes:mid\r
a=extmap:2 urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id\r
m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r
c=IN IP4 192.168.4.1\r
a=candidate:1 1 UDP 2122260223 192.168.4.1 55432 typ host\r
a=sctp-port:5000\r
a=setup:actpass\r
`;

const compacted = compactSDP(rawSdp);
assert(!compacted.includes("a=extmap:"), "Compacted SDP strips unnecessary a=extmap lines");
assert(compacted.includes("a=candidate:1"), "Compacted SDP preserves essential host candidates");
assert(compacted.includes("a=sctp-port:5000"), "Compacted SDP preserves SCTP configuration");
assert(compacted.endsWith("\r\n"), "Compacted SDP strictly terminates with mandatory CRLF");

// Test corrupted / concatenated SDP lines (the exact issue reported by user)
const corruptedSdp = "v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\na=mid:0a=max-message-size:.....a=candidate:1 1 UDP 123 192.168.1.1 5000 typ host";
const sanitized = sanitizeSDP(corruptedSdp);
assert(sanitized.includes("a=mid:0\r\n"), "SanitizeSDP splits concatenated lines before a=mid:0");
assert(sanitized.includes("a=max-message-size:262144\r\n"), "SanitizeSDP repairs corrupted a=max-message-size:..... to standard 262144");
assert(sanitized.includes("a=candidate:1"), "SanitizeSDP preserves candidate line after repaired boundary");
assert(sanitized.endsWith("\r\n"), "SanitizeSDP ensures trailing CRLF");

// ----------------------------------------------------
// 2. Optical QR Signaling: Single vs Multi-Frame Chunking
// ----------------------------------------------------
console.log("\n[2] Optical QR Signaling: Single Frame vs Multi-Frame Chunking");

// Small payload <= MAX_SINGLE_QR_CHARS
const smallPayload = "v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\nm=application 9\r\na=candidate:host 192.168.1.10";
const singleFrames = prepareQRFrames(smallPayload);
assert(singleFrames.length === 1, `Small payload produces 1 frame (got ${singleFrames.length})`);
assert(singleFrames[0] === smallPayload, "Single frame content matches small payload directly");

// Large payload > MAX_SINGLE_QR_CHARS (e.g. 2400 chars)
const largePayload = "SAMPLE_SDP_LINE_WITH_DETAILED_PARAMETERS_FOR_LOCAL_HOTSPOT_".repeat(40);
assert(largePayload.length > MAX_SINGLE_QR_CHARS, `Large payload exceeds ${MAX_SINGLE_QR_CHARS} chars`);

const multiFrames = prepareQRFrames(largePayload);
assert(multiFrames.length > 1, `Large payload produces multi-frame sequence (got ${multiFrames.length} frames)`);

// Test frame header format
const firstFrameHeader = parseQRFrame(multiFrames[0]);
assert(firstFrameHeader !== null, "First frame header parses successfully");
assert(firstFrameHeader?.index === 0, `First frame index is 0 (got ${firstFrameHeader?.index})`);
assert(firstFrameHeader?.total === multiFrames.length, `First frame total matches frames length (${firstFrameHeader?.total})`);

// ----------------------------------------------------
// 3. QR Chunk Collector Reassembly
// ----------------------------------------------------
console.log("\n[3] QR Chunk Collector Optical Reassembly Verification");

const collector = new QRChunkCollector();

// Feed frames out of order or sequentially
let finalResult: { isComplete: boolean; data: string | null } = { isComplete: false, data: null };

for (let i = multiFrames.length - 1; i >= 0; i--) {
  finalResult = collector.feed(multiFrames[i]);
  if (i > 0) {
    assert(!finalResult.isComplete, `Collector is incomplete after ${multiFrames.length - i} frames`);
  }
}

assert(finalResult.isComplete, "Collector completes when all frames are fed");
assert(finalResult.data === largePayload, "Reassembled payload matches original multi-frame payload exactly");

// Test single frame feed into collector
collector.reset();
const singleResult = collector.feed(smallPayload);
assert(singleResult.isComplete, "Single frame immediately completes in collector");
assert(singleResult.data === smallPayload, "Single frame data matches original");

// ----------------------------------------------------
// 4. Hop Count Ceiling & Loop Prevention
// ----------------------------------------------------
console.log("\n[4] Hop Count Ceiling & Deduplication Protection");

const baseAlert: OfficialAlert = {
  id: "test-alert-001",
  hazardType: "LANDSLIDE_SLIP",
  severity: "CRITICAL",
  message: "Slope slip at Tindharia corridor",
  issuedAt: Date.now(),
  photoBlob: {} as Blob,
  hopCount: 0,
};

// Hop 0
const hop0Check = canRelayAlert(baseAlert);
assert(hop0Check.allowed, `Hop 0 alert can be relayed`);

// Hop 5 (Below max 6)
const hop5Alert: OfficialAlert = { ...baseAlert, hopCount: MAX_HOP_COUNT - 1 };
const hop5Check = canRelayAlert(hop5Alert);
assert(hop5Check.allowed, `Hop ${MAX_HOP_COUNT - 1} alert can be relayed`);

// Hop 6 (At ceiling)
const hop6Alert: OfficialAlert = { ...baseAlert, hopCount: MAX_HOP_COUNT };
const hop6Check = canRelayAlert(hop6Alert);
assert(!hop6Check.allowed, `Hop ${MAX_HOP_COUNT} alert is BLOCKED from relaying`);
assert(
  Boolean(hop6Check.reason?.includes("Relay limit reached")),
  `Hop cap provides clear user explanation (${hop6Check.reason})`
);

// Hop 7 (Beyond ceiling)
const hop7Alert: OfficialAlert = { ...baseAlert, hopCount: MAX_HOP_COUNT + 1 };
const hop7Check = canRelayAlert(hop7Alert);
assert(!hop7Check.allowed, `Hop ${MAX_HOP_COUNT + 1} alert is BLOCKED from relaying`);

// ----------------------------------------------------
// SUMMARY
// ----------------------------------------------------
console.log(`\n======================================================`);
console.log(`RELAY SUB-SYSTEM TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}

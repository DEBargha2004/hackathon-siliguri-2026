# 🏔️ DHR Hazard Reporter

### _Offline-first slope intelligence & peer-to-peer corridor relay for the Siliguri–Darjeeling hills._

[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-4A90E2?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Built for Hackathon Siliguri 2026](https://img.shields.io/badge/Hackathon-Siliguri%202026-059669)](https://github.com/)

---

## 🌧️ The Story Behind the Project

Every monsoon season, the winding corridor connecting **Siliguri, Kurseong, and Darjeeling** faces severe geographic vulnerability. Torrential cloudbursts trigger sudden landslides, mudslides, and boulder washouts along National Highway 55 / Hill Cart Road and the historic, UNESCO World Heritage **Darjeeling Himalayan Railway (DHR)**.

The terrain presents a deadly combination:

1. **Unpredictable Slope Instability**: Mountain slopes can shear away in minutes under heavy precipitation.
2. **Connectivity Dead Zones**: In deep ravines, pine-forested valleys, and dense fog, mobile towers lose line-of-sight. There is often zero 4G/5G or cellular signal.

When a track gang, railway patrol, taxi driver, or local resident discovers an active landslide or track displacement, they cannot simply upload a video or call an emergency hotline. Crucial minutes tick away before oncoming trains or commuter convoys can be warned.

**DHR Hazard Reporter** was engineered to eliminate this blind spot. It is a zero-latency, offline-first Progressive Web App (PWA) that empowers anyone on the ground to detect and classify slope hazards with on-device computer vision, formulate multilingual emergency guidance, and hop alerts peer-to-peer from phone to phone down the mountain—without relying on the internet.

---

## ✨ Key Capabilities

| Capability                         | How It Helps                                                                                          | Offline Mechanism                                                           |
| :--------------------------------- | :---------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| **🔍 Edge Computer Vision**        | Instantly scans photos/camera feeds for rockfalls, landslides, debris, or track obstruction.          | In-browser ONNX neural network running via WebGPU / WASM.                   |
| **🧠 Multi-Tier Advisory Cascade** | Formulates rapid emergency warnings in 4 corridor languages (**Nepali, Bengali, Hindi, English**).    | Chrome Built-in AI / Qwen2.5-0.5B / Deterministic situational rules.        |
| **📻 Sneakernet Corridor Relay**   | Passes alerts between passing vehicles, rail staff, and locals without any Wi-Fi or cellular network. | High-speed animated QR burst sequences & WebRTC peer-to-peer data channels. |
| **☁️ Opportunistic Cloud Sync**    | Syncs all collected corridor alerts with centralized emergency control rooms.                         | Auto-syncs to Supabase the moment a device re-enters cellular coverage.     |
| **📱 100% Client-Side PWA**        | Works straight from mobile browsers; installable to home screen with full offline caching.            | Service Worker precache + IndexedDB neural model weights storage.           |

---

## 🔬 Technical Architecture & Edge AI Strategy

Running modern AI and resilient networking on low-powered mobile devices in high-altitude dead zones requires strict performance guardrails and zero memory-leak architectures. Here is how our system is engineered:

```
                  ┌─────────────────────────────────────────────────┐
                  │           User Camera / Image Upload            │
                  └────────────────────────┬────────────────────────┘
                                           │
                                           ▼
             ┌───────────────────────────────────────────────────────────┐
             │       ON-DEVICE NEURAL VISION PIPELINE (Transformers.js)  │
             │   Model: onnx-community/mobilenetv4_conv_small.e2400_r224 │
             │       Delegates: WebGPU (preferred) ➔ WASM ➔ Heuristic   │
             │     Weight Cache: IndexedDB single-copy persistent storage│
             └─────────────────────────────┬─────────────────────────────┘
                                           │
                                           ▼
             ┌───────────────────────────────────────────────────────────┐
             │               MULTI-TIER ADVISORY CASCADE                 │
             │  Tier 1: Chrome Built-in AI (Gemini Nano via window.ai)   │
             │  Tier 2: In-browser SLM (Qwen2.5-0.5B-Instruct • Q4)      │
             │  Tier 3: Situational Multilingual Engine (Zero-Crash)     │
             │          (Nepali / Bengali / Hindi / English)             │
             └─────────────────────────────┬─────────────────────────────┘
                                           │
                                           ▼
             ┌───────────────────────────────────────────────────────────┐
             │               CORRIDOR RELAY (Sneakernet & P2P)           │
             │   • High-Density Animated QR Code Burst Transfer          │
             │   • WebRTC DataChannel (QR-signaled camera handshake)     │
             │   • Persistent Alert Store in IndexedDB (idb)             │
             └─────────────────────────────┬─────────────────────────────┘
                                           │ (Device reaches signal)
                                           ▼
             ┌───────────────────────────────────────────────────────────┐
             │       CENTRALIZED DISASTER SYNC (Supabase Backend)        │
             │     Idempotent batch upsert & emergency dispatcher map   │
             └───────────────────────────────────────────────────────────┘
```

### 1. Vision Pipeline & Model Selection

- **Neural Model**: [`onnx-community/mobilenetv4_conv_small.e2400_r224_in1k`](https://huggingface.co/onnx-community/mobilenetv4_conv_small.e2400_r224_in1k) executed directly in the browser via `@huggingface/transformers` and ONNX Runtime Web.
- **Hardware Acceleration**: Automatically probes the environment to run on **WebGPU** for real-time inference (sub-100ms on modern phones). If WebGPU is unavailable, it gracefully defaults to multithreaded **WASM**.
- **Permanent IndexedDB Neural Cache**: To avoid re-downloading model weights (~15MB) in the mountains, models are cached in a dedicated IndexedDB store (`createTransformersCustomCache`). Once fetched once, subsequent app boots rehydrate instantly with zero network requests.
- **Hazard Classification & Heuristics**: The output logits are mapped through a domain classifier that identifies:
  - Landslides / Mudslips
  - Rockfalls / Boulder accumulation
  - Rail track deformation / Structural washouts
  - Edge density, color histograms, and texture variances provide confidence weighting and fallback validation.

### 2. Multi-Tier Advisory Cascade (Graceful Degradation)

Not every phone has 16GB of RAM or a dedicated GPU. To prevent Out-Of-Memory (OOM) browser crashes on consumer Android and iOS devices, we implemented a **3-tier cascading intelligence strategy**:

1. **Tier 1 — Chrome Built-in AI (Gemini Nano)**:
   - Probes `window.ai.languageModel` for native on-device Gemini Nano capabilities.
   - If available, delivers fast generative analysis with zero bundle download.
2. **Tier 2 — In-Browser Quantized SLM (`Qwen2.5-0.5B-Instruct`)**:
   - Model: [`onnx-community/Qwen2.5-0.5B-Instruct`](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct) in 4-bit quantization (~350MB footprint).
   - **Crucial Guardrail**: This tier is **only enabled when a real WebGPU adapter is present**. Running 0.5B LLMs via WASM CPU on mobile browsers causes 2GB+ memory allocations and browser tab termination; our memory guardrail intercepts this and bypasses CPU WASM execution safely.
3. **Tier 3 — Multilingual Situational Engine (Zero-Crash Guarantee)**:
   - A deterministic, contextual rule engine that produces localized action items instantly (<1ms latency).
   - Formats actionable railway & commuter directives across **four languages native to the corridor**:
     - 🇳🇵 **Nepali (`ne`)**: The primary lingua franca of the Darjeeling and Kurseong hill communities.
     - 🇮🇳 **Bengali (`bn`)**: State administrative language of West Bengal / Siliguri plains.
     - 🇮🇳 **Hindi (`hi`)**: Widely understood by national tourists, transport operators, and Indian Railways crews.
     - 🇬🇧 **English (`en`)**: Official emergency logging and dispatcher telemetry.

### 3. "Corridor Relay" Sneakernet & P2P Protocol

When an alert is generated in a valley without cell reception, it travels physically along the transport corridor via human movement:

- **Animated QR Burst Transfer (Camera-to-Screen Fountain Code)**:
  - Alerts (including GPS coordinates, severity, timestamp, and compressed image thumbnails) are JSON-serialized, compressed, and partitioned into discrete chunks with sequence headers and CRC checksums.
  - The sender loops these chunks on-screen at 8–15 FPS as animated high-density QR codes.
  - The receiver's camera scans the stream in any order, reassembling the alert once all unique chunks are captured.
  - **No Wi-Fi, Bluetooth pairing, or cables required.**
- **WebRTC Zero-Network Mesh Handshake**:
  - For larger payloads, peer devices use camera-scanned QR codes to exchange SDP offers and answers directly (air-gapped signaling).
  - A local WebRTC `RTCDataChannel` connects the two devices for instantaneous peer-to-peer synchronisation.
- **IndexedDB Event Sourcing**:
  - Alerts are stored with unique hashes, monotonic timestamps, and hop counters to prevent duplicate re-transmissions and routing loops.

---

## 🚀 Getting Started

You can run the full environment locally in under two minutes.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [pnpm](https://pnpm.io/) (or `npm` / `yarn`)

### 1. Clone the repository

```bash
git clone https://github.com/DEBargha2004/hackathon-siliguri-2026.git
cd hackathon-siliguri-2026
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Set up environment variables

Copy the provided sample configuration:

```bash
cp .env.example .env
```

_(The default demo credentials in `.env.example` connect to the staging database for testing.)_

### 4. Start the local dev server

```bash
pnpm dev
```

Open your browser at `http://localhost:5173`.

---

## 🧭 How to Test the Offline Experience

1. **Pre-cache Models**: Open `http://localhost:5173`. On the initial load, the lightweight vision weights will download and cache into your browser's IndexedDB.
2. **Go Offline**: Toggle your phone into **Airplane Mode**, or open Chrome DevTools ➔ Network tab ➔ select **Offline**.
3. **Analyze a Slope**: Switch to the **Hazard Analyzer** tab, take a photo or select a test image, and hit inspect. Watch the on-device model classify the hazard and generate 4-language advisories without a single network ping.
4. **Relay via QR**:
   - Tap **Save / Relay Alert**.
   - Select **Host Relay** to initiate the animated QR code broadcast.
   - Open a second device (also in Airplane mode!), go to **Corridor Relay** ➔ **Receive Relay**, and point the camera at the animated QR code to ingest the alert.
5. **Re-enter Coverage**: Turn Airplane Mode off. The app detects connectivity and pushes all cached records directly to Supabase.

---

## 🛠️ Tech Stack & Dependencies

- **Frontend Engine**: [React 19](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/), [Vite 8](https://vitejs.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/) tokens, [Lucide Icons](https://lucide.dev/)
- **Edge Vision & SLMs**:
  - `@huggingface/transformers` (ONNX Runtime Web with WebGPU/WASM delegates)
  - Vision: `onnx-community/mobilenetv4_conv_small.e2400_r224_in1k`
  - Language: `onnx-community/Qwen2.5-0.5B-Instruct` (Quantized Q4)
  - Native: Window AI (`window.ai.languageModel` / Gemini Nano)
- **Offline & Relay Protocol**:
  - `vite-plugin-pwa` (Service workers & manifest for offline asset caching)
  - `idb` (IndexedDB for raw alert persistence & neural weight storage)
  - `html5-qrcode` & `jsqr` (High-speed camera QR frame decoding)
  - `qrcode` (Dynamic on-the-fly burst generation)
  - Native WebRTC `RTCDataChannel`
- **Cloud Backend**: [Supabase](https://supabase.com/) (`@supabase/supabase-js`)

---

## 📂 Project Structure

```text
hackathon-siliguri-2026/
├── src/
│   ├── components/
│   │   ├── intelligence/         # Hazard analyzer, camera view, model warm-up & FPS counter
│   │   ├── relay/                # Sneakernet P2P UI, animated QR broadcaster & receiver dialogs
│   │   └── ui/                   # Reusable UI elements (cards, badges, modals)
│   ├── lib/
│   │   ├── vision/               # MobileNetV4 classifier, severity scoring, heuristics
│   │   ├── llm/                  # Advisory cascade (Nano -> Qwen2.5-0.5B -> 4-locale fallback)
│   │   ├── relay/                # IndexedDB alert store, QR chunking, WebRTC peer signaling
│   │   ├── cache/                # Custom IndexedDB model weight cache for Transformers.js
│   │   └── supabase/             # Background auto-sync and emergency cloud client
│   ├── types/                    # Intelligence and relay TypeScript definitions
│   ├── App.tsx                   # Main dual-view interface (Analyzer vs Corridor Relay)
│   └── main.tsx                  # Root entry point
├── public/                       # PWA manifest, offline assets, and service worker icons
└── vite.config.ts                # PWA service worker config & build settings
```

---

## 🤝 Contributing & Feedback

Whether you are passionate about disaster resilience, edge AI on resource-constrained devices, or sneakernet networking in rural and mountainous terrains, we welcome your ideas!

Feel free to open an issue, submit a pull request, or drop your suggestions.

---

_Crafted with heart for **Hackathon Siliguri 2026** to help keep the hill roads and heritage tracks safe for everyone._ 🚂💚

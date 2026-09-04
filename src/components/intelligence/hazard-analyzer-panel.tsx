import React, { useCallback, useState } from "react";
import { DHR_TEST_POINTS } from "@/lib/telemetry/sensors";
import type { AdvisoryTier, Locale, TelemetryData } from "@/types/intelligence";
import { SCENARIO_PRESETS, getFriendlyLocation, type ScenarioId } from "./config/scenario-config";
import { loadPresetImage } from "./scenarios/scenario-loader";
import { useHazardWorker } from "./hooks/use-hazard-worker";
import { useHazardCamera } from "./hooks/use-hazard-camera";
import { useSpeechAudio } from "./hooks/use-speech-audio";
import { WizardStepper } from "./components/wizard-stepper";
import { DiagnosticsDrawer } from "./components/diagnostics-drawer";
import { StepCapture } from "./steps/step-capture";
import { StepConfirm } from "./steps/step-confirm";
import { StepDirective } from "./steps/step-directive";
import { useReportQueue } from "@/lib/queue/use-report-queue";
import { imageBitmapToBlob } from "@/lib/queue/blob-utils";
import { ReportQueueDrawer } from "@/components/queue/report-queue-drawer";

export const HazardAnalyzerPanel: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [selectedLocale, setSelectedLocale] = useState<Locale>("ne");
  const [forcedTier, setForcedTier] = useState<AdvisoryTier | "auto">("auto");
  const [telemetry, setTelemetry] = useState<TelemetryData>(DHR_TEST_POINTS.tindharia);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [isQueueDrawerOpen, setIsQueueDrawerOpen] = useState<boolean>(false);
  const [lastQueuedId, setLastQueuedId] = useState<string | null>(null);
  const enqueuedResultIdRef = React.useRef<string | null>(null);

  // Queue Subsystem Hook
  const {
    enqueue,
    stats: queueStats,
    isSyncing: isQueueSyncing,
  } = useReportQueue();

  // Hook 1: Off-thread Worker Lifecycle & LLM Cascade
  const {
    lifecycleState,
    loadingProgress,
    loadingStage,
    activeTier,
    errorMessage,
    memoryHeapMB,
    analysisResult,
    dispatchAnalyze,
    clearError,
    setAnalysisResult,
  } = useHazardWorker({
    onResult: () => setCurrentStep(3),
  });

  // Hook 2: Camera Stream, Snapshotting, and Blob URL Memory Management
  const {
    cameraStream,
    isCameraActive,
    isFlashing,
    previewImageUrl,
    capturedBitmap,
    activeScenarioId,
    cameraError,
    startCamera,
    stopCamera,
    toggleCameraFacing,
    captureFrameFromVideo,
    handleFile,
    setPhotoFrame,
    clearPhoto,
  } = useHazardCamera({
    onTelemetryUpdate: setTelemetry,
  });

  // Hook 3: Web Speech Audio Advisory Synthesis
  const { isSpeaking, toggleSpeech, stopSpeech } = useSpeechAudio();

  // Handle preset hazard selection (Updates frame cleanly without starting inference)
  const handleSelectPreset = useCallback(
    async (scenarioId: ScenarioId) => {
      try {
        const { bitmap, url } = await loadPresetImage(scenarioId);
        setPhotoFrame(url, bitmap, scenarioId);

        const preset = SCENARIO_PRESETS.find((p) => p.id === scenarioId);
        if (preset) {
          setTelemetry({
            ...DHR_TEST_POINTS[preset.telemetryKey],
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.error("Failed to render scenario preset:", err);
      }
    },
    [setPhotoFrame]
  );

  // Trigger on-device inference explicitly from Step 2
  const handleRunAnalysis = useCallback(() => {
    if (!capturedBitmap) return;
    dispatchAnalyze(capturedBitmap, telemetry, selectedLocale, forcedTier);
  }, [capturedBitmap, dispatchAnalyze, forcedTier, selectedLocale, telemetry]);

  // Reset entire workflow cleanly to Step 1
  const handleReset = useCallback(() => {
    clearPhoto();
    stopSpeech();
    setAnalysisResult(null);
    setCurrentStep(1);
  }, [clearPhoto, setAnalysisResult, stopSpeech]);

  // Switch locale instantaneously in Step 3 without re-running LLM or worker
  const handleSwitchLocale = useCallback(
    (locale: Locale) => {
      setSelectedLocale(locale);
      stopSpeech();
    },
    [stopSpeech]
  );

  // Tier override in diagnostics drawer
  const handleSelectForcedTier = useCallback(
    (tier: AdvisoryTier | "auto") => {
      setForcedTier(tier);
      if (capturedBitmap) {
        dispatchAnalyze(capturedBitmap, telemetry, selectedLocale, tier);
      }
    },
    [capturedBitmap, dispatchAnalyze, selectedLocale, telemetry]
  );

  // Copy canonical JSON report to clipboard
  const handleCopyJson = useCallback(() => {
    if (!analysisResult) return;
    navigator.clipboard.writeText(JSON.stringify(analysisResult, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  }, [analysisResult]);

  const friendlyLandmark = getFriendlyLocation(
    activeScenarioId,
    Boolean(telemetry.coordinates)
  );

  // Automatically persist report to IndexedDB queue upon hazard classification
  React.useEffect(() => {
    if (analysisResult && capturedBitmap) {
      if (enqueuedResultIdRef.current === analysisResult.id) return;
      enqueuedResultIdRef.current = analysisResult.id;

      let isCancelled = false;
      imageBitmapToBlob(capturedBitmap)
        .then((photoBlob) => {
          if (!isCancelled) {
            return enqueue(analysisResult.context, analysisResult.advisory, photoBlob);
          }
        })
        .then((qId) => {
          if (!isCancelled && qId) {
            setLastQueuedId(qId);
          }
        })
        .catch((err) => {
          console.warn("[HazardAnalyzer] Auto-enqueue failed:", err);
        });

      return () => {
        isCancelled = true;
      };
    }
  }, [analysisResult, capturedBitmap, enqueue]);

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-12">
      {/* Reusable Stepper Header */}
      <WizardStepper
        currentStep={currentStep}
        onStepClick={setCurrentStep}
        canAccessStep2={Boolean(capturedBitmap)}
        canAccessStep3={Boolean(analysisResult)}
        lifecycleState={lifecycleState}
        loadingProgress={loadingProgress}
        loadingStage={loadingStage}
        queuePendingCount={queueStats.pendingCount}
        queueFailedCount={queueStats.failedCount}
        queueSyncedCount={queueStats.syncedCount}
        isSyncingQueue={isQueueSyncing}
        onOpenQueue={() => setIsQueueDrawerOpen(true)}
      />

      {/* Subsystem Error Banner */}
      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            onClick={clearError}
            className="text-[10px] font-bold underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Step 1: Capture Hazard Photo */}
      {currentStep === 1 && (
        <StepCapture
          cameraStream={cameraStream}
          isCameraActive={isCameraActive}
          isFlashing={isFlashing}
          previewImageUrl={previewImageUrl}
          capturedBitmap={capturedBitmap}
          activeScenarioId={activeScenarioId}
          cameraError={cameraError}
          onStartCamera={() => startCamera("environment")}
          onStopCamera={stopCamera}
          onToggleCameraFacing={toggleCameraFacing}
          onCaptureCamera={captureFrameFromVideo}
          onPhotoFile={handleFile}
          onSelectPreset={handleSelectPreset}
          onClearPhoto={clearPhoto}
          onProceed={() => setCurrentStep(2)}
        />
      )}

      {/* Step 2: Confirm Hazard Photo (Decongested & Focused) */}
      {currentStep === 2 && (
        <StepConfirm
          previewImageUrl={previewImageUrl}
          friendlyLandmark={friendlyLandmark}
          isProcessing={lifecycleState === "PROCESSING"}
          onRunAnalysis={handleRunAnalysis}
          onRetake={() => setCurrentStep(1)}
        />
      )}

      {/* Step 3: Actionable Field Directive & Relay */}
      {currentStep === 3 && analysisResult && (
        <StepDirective
          result={analysisResult}
          selectedLocale={selectedLocale}
          isProcessing={lifecycleState === "PROCESSING"}
          isSpeaking={isSpeaking}
          onToggleSpeech={toggleSpeech}
          onSwitchLocale={handleSwitchLocale}
          onReset={handleReset}
          onReAnalyze={handleRunAnalysis}
          onOpenQueue={() => setIsQueueDrawerOpen(true)}
          queuedReportId={lastQueuedId}
        />
      )}

      {/* Diagnostics Drawer (Confined Strictly to Step 3 for Judges / Engineers) */}
      {currentStep === 3 && (
        <DiagnosticsDrawer
          activeTier={activeTier}
          forcedTier={forcedTier}
          onSelectForcedTier={handleSelectForcedTier}
          memoryHeapMB={memoryHeapMB}
          analysisResult={analysisResult}
          onCopyJson={handleCopyJson}
          copiedJson={copiedJson}
        />
      )}

      {/* Report Queue & Sync Monitor Drawer */}
      <ReportQueueDrawer
        isOpen={isQueueDrawerOpen}
        onClose={() => setIsQueueDrawerOpen(false)}
      />
    </div>
  );
};

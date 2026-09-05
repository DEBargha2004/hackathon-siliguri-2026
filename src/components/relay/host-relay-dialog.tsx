import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Radio,
  ArrowRight,
  X,
  Share2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OfficialAlert, TransferProgress } from "@/types/alert";
import { canRelayAlert } from "@/lib/relay/alert-store";
import {
  prepareQRFrames,
  renderQRCodeDataUrl,
} from "@/lib/relay/qr-signaling";
import {
  initHostPeer,
  type HostPeerSession,
  type PeerConnectionState,
} from "@/lib/relay/webrtc-peer";
import { sendAlertOverChannel } from "@/lib/relay/chunked-transfer";
import { QRScannerView } from "./qr-scanner-view";

export interface HostRelayDialogProps {
  alert: OfficialAlert;
  isOpen: boolean;
  onClose: () => void;
  onRelayCompleted?: (updatedAlert: OfficialAlert) => void;
}

export const HostRelayDialog: React.FC<HostRelayDialogProps> = ({
  alert,
  isOpen,
  onClose,
  onRelayCompleted,
}) => {
  // Wizard steps: 1: SHOW_OFFER_QR, 2: SCAN_ANSWER_QR, 3: TRANSFERRING, 4: COMPLETED, 5: BLOCKED
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const [session, setSession] = useState<HostPeerSession | null>(null);
  const [connState, setConnState] = useState<PeerConnectionState>("INITIALIZING");
  const [qrDataUrls, setQrDataUrls] = useState<string[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isAnimationPaused, setIsAnimationPaused] = useState<boolean>(false);
  const [copiedOffer, setCopiedOffer] = useState<boolean>(false);

  const [transferProgress, setTransferProgress] = useState<TransferProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionRef = useRef<HostPeerSession | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up session on unmount or close
  const cleanupSession = useCallback(() => {
    if (animationTimerRef.current) {
      clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setSession(null);
  }, []);

  // Initialize Host Peer Connection & Generate QR
  useEffect(() => {
    if (!isOpen) {
      cleanupSession();
      return;
    }

    // Step 0: Check Hop Count Limit
    const hopCheck = canRelayAlert(alert);
    if (!hopCheck.allowed) {
      setBlockedReason(hopCheck.reason || "Relay limit reached.");
      setStep(5);
      return;
    }

    setStep(1);
    setErrorMessage(null);
    setTransferProgress(null);

    let isCancelled = false;

    const setupHost = async () => {
      try {
        setConnState("INITIALIZING");
        const hostSession = await initHostPeer({
          onStateChange: (state) => {
            if (!isCancelled) setConnState(state);
          },
          onError: (err) => {
            if (!isCancelled) setErrorMessage(err.message);
          },
        });

        if (isCancelled) {
          hostSession.close();
          return;
        }

        sessionRef.current = hostSession;
        setSession(hostSession);

        // Prepare single or chunked QR frames
        const frames = prepareQRFrames(hostSession.offerSdp);
        const renderedUrls: string[] = [];
        for (const frame of frames) {
          const url = await renderQRCodeDataUrl(frame, { width: 360, margin: 4 });
          renderedUrls.push(url);
        }

        if (!isCancelled) {
          setQrDataUrls(renderedUrls);
          setCurrentFrameIndex(0);
        }
      } catch (err) {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : "Failed to initialize WebRTC Host";
          setErrorMessage(msg);
        }
      }
    };

    setupHost();

    return () => {
      isCancelled = true;
      cleanupSession();
    };
  }, [alert, isOpen, cleanupSession]);

  // Frame cycling animation for multi-frame QR codes (420ms gives cameras exposure stabilization)
  useEffect(() => {
    if (animationTimerRef.current) {
      clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }

    if (qrDataUrls.length > 1 && !isAnimationPaused && step === 1) {
      animationTimerRef.current = setInterval(() => {
        setCurrentFrameIndex((prev) => (prev + 1) % qrDataUrls.length);
      }, 420);
    }

    return () => {
      if (animationTimerRef.current) {
        clearInterval(animationTimerRef.current);
      }
    };
  }, [qrDataUrls.length, isAnimationPaused, step]);

  // Handle scanned answer SDP from Receiver
  const handleAnswerScanned = async (scannedAnswerSdp: string) => {
    if (!sessionRef.current) return;

    try {
      setErrorMessage(null);
      setStep(3); // Transition to transferring state
      await sessionRef.current.applyAnswerSdp(scannedAnswerSdp);

      const activeChannel = sessionRef.current.dataChannel;

      // Ensure channel is open before sending
      if (activeChannel.readyState !== "open") {
        await new Promise<void>((resolve, reject) => {
          const onOpen = () => {
            activeChannel.removeEventListener("open", onOpen);
            resolve();
          };
          activeChannel.addEventListener("open", onOpen);
          setTimeout(() => reject(new Error("DataChannel open timed out.")), 6000);
        });
      }

      // Stream alert metadata + chunked photoBlob
      await sendAlertOverChannel(activeChannel, alert, {
        onProgress: (progress) => {
          setTransferProgress(progress);
        },
      });

      setStep(4); // Transfer completed!
      onRelayCompleted?.(alert);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Relay transfer failed";
      setErrorMessage(msg);
      setStep(2); // Allow retry scan
    }
  };

  const handleCopyOfferSdp = () => {
    if (!session?.offerSdp) return;
    navigator.clipboard.writeText(session.offerSdp);
    setCopiedOffer(true);
    setTimeout(() => setCopiedOffer(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Radio className="h-4 w-4 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold tracking-tight">Host Alert Relay</h3>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded-full bg-muted-foreground/10 text-muted-foreground">
                  {connState}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                P2P Optical Handshake • Hop #{alert.hopCount}
              </p>
            </div>
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={onClose}
            className="h-7 w-7 p-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 5: BLOCKED DUE TO HOP COUNT */}
          {step === 5 && (
            <div className="text-center py-6 space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-foreground">Relay Cap Enforced</h4>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                {blockedReason}
              </p>
              <div className="pt-2">
                <Button size="sm" variant="outline" onClick={onClose} className="rounded-xl text-xs">
                  Acknowledge & Close
                </Button>
              </div>
            </div>
          )}

          {/* STEP 1: DISPLAY HOST OFFER QR CODE */}
          {step === 1 && (
            <div className="space-y-4 text-center">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full">
                  Step 1 of 2: Receiver Scans Host
                </span>
                <p className="text-xs text-muted-foreground">
                  Ask the offline phone to open "Receive Alert" and point their camera at this QR code.
                </p>
              </div>

              {/* QR Display Frame */}
              <div className="relative mx-auto w-72 h-72 sm:w-80 sm:h-80 rounded-2xl border-2 border-border bg-white p-3 shadow-inner flex flex-col items-center justify-center">
                {qrDataUrls.length > 0 ? (
                  <img
                    src={qrDataUrls[currentFrameIndex]}
                    alt={`Host Offer QR ${currentFrameIndex + 1}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Radio className="h-8 w-8 animate-spin text-emerald-600" />
                    <span className="text-[11px] font-medium text-black">
                      Gathering local host candidates...
                    </span>
                  </div>
                )}

                {/* Animated frame badge if multi-frame */}
                {qrDataUrls.length > 1 && (
                  <div className="absolute bottom-2 rounded-full bg-black/85 px-3 py-0.5 text-[10px] font-mono text-white flex items-center gap-1.5 shadow-md">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Frame {currentFrameIndex + 1} of {qrDataUrls.length}
                  </div>
                )}
              </div>

              {/* Multi-frame controls */}
              {qrDataUrls.length > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setCurrentFrameIndex(
                        (prev) => (prev - 1 + qrDataUrls.length) % qrDataUrls.length
                      )
                    }
                    className="text-[10px] h-7 rounded-lg gap-1 px-2"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Prev
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setIsAnimationPaused(!isAnimationPaused)}
                    className="text-[10px] h-7 rounded-lg gap-1 px-2.5 font-semibold"
                  >
                    {isAnimationPaused ? (
                      <>
                        <Play className="h-3 w-3 text-emerald-600" /> Resume Cycle
                      </>
                    ) : (
                      <>
                        <Pause className="h-3 w-3 text-amber-600" /> Pause Frame
                      </>
                    )}
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      setCurrentFrameIndex(
                        (prev) => (prev + 1) % qrDataUrls.length
                      )
                    }
                    className="text-[10px] h-7 rounded-lg gap-1 px-2"
                  >
                    Next
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Action: Transition to Scan Receiver's Answer */}
              <div className="pt-2 flex flex-col gap-2">
                <Button
                  size="default"
                  onClick={() => setStep(2)}
                  disabled={qrDataUrls.length === 0}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-md gap-2 h-11"
                >
                  <span>Receiver Has Scanned • Now Scan Their Answer QR</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <Button
                  size="xs"
                  variant="ghost"
                  onClick={handleCopyOfferSdp}
                  className="text-[10px] text-muted-foreground gap-1"
                >
                  <Copy className="h-3 w-3" />
                  {copiedOffer ? "Copied Offer SDP" : "Copy Raw Offer SDP"}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: SCAN RECEIVER'S ANSWER QR CODE */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="text-center space-y-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-0.5 rounded-full">
                  Step 2 of 2: Scan Receiver's Screen
                </span>
                <p className="text-xs text-muted-foreground">
                  Point this camera at the Answer QR shown on the receiver's phone.
                </p>
              </div>

              <QRScannerView
                title="Scan Receiver Answer QR"
                description="Align the receiver's answer QR within the frame"
                onScanComplete={handleAnswerScanned}
                onCancel={() => setStep(1)}
              />

              <div className="text-center">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setStep(1)}
                  className="text-[11px] text-muted-foreground"
                >
                  ← Back to show Host Offer QR
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: TRANSFERRING DATA & PHOTO CHUNKS */}
          {step === 3 && (
            <div className="py-6 space-y-4 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600">
                <Share2 className="h-6 w-6 animate-bounce" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  Streaming Alert & Photo over DataChannel
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Direct peer-to-peer transmission with SCTP backpressure control
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5 max-w-xs mx-auto">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-emerald-600 transition-all duration-150 rounded-full"
                    style={{ width: `${transferProgress?.percent || 10}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>
                    {transferProgress
                      ? `${Math.round(transferProgress.bytesTransferred / 1024)} KB / ${Math.round(transferProgress.totalBytes / 1024)} KB`
                      : "Connecting..."}
                  </span>
                  <span>{transferProgress?.percent || 0}%</span>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground font-medium">
                Keep phones within local hotspot range
              </p>
            </div>
          )}

          {/* STEP 4: COMPLETED */}
          {step === 4 && (
            <div className="py-6 space-y-4 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600">
                <CheckCircle className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">
                  Alert Successfully Relayed!
                </h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Official advisory and full-resolution evidence photo delivered to peer device.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3 text-left space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Hop Count:</span>
                  <span className="font-mono font-bold">{alert.hopCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Peer Hop Count:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {alert.hopCount + 1}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Evidence Photo:</span>
                  <span className="font-semibold text-emerald-600">Verified & Intact</span>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  size="default"
                  onClick={onClose}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs h-10 shadow-md"
                >
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

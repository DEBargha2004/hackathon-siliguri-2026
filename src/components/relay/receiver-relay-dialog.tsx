import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Radio,
  X,
  Share2,
  Copy,
  Inbox,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OfficialAlert, TransferProgress } from "@/types/alert";
import {
  prepareQRFrames,
  renderQRCodeDataUrl,
  sanitizeSDP,
} from "@/lib/relay/qr-signaling";
import {
  initReceiverPeer,
  type ReceiverPeerSession,
  type PeerConnectionState,
} from "@/lib/relay/webrtc-peer";
import { receiveAlertOverChannel } from "@/lib/relay/chunked-transfer";
import { QRScannerView } from "./qr-scanner-view";

export interface ReceiverRelayDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAlertReceived?: (alert: OfficialAlert) => void;
}

export const ReceiverRelayDialog: React.FC<ReceiverRelayDialogProps> = ({
  isOpen,
  onClose,
  onAlertReceived,
}) => {
  // Wizard steps: 1: SCAN_HOST_OFFER, 2: SHOW_ANSWER_QR, 3: RECEIVING_DATA, 4: COMPLETED
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [session, setSession] = useState<ReceiverPeerSession | null>(null);
  const [connState, setConnState] =
    useState<PeerConnectionState>("INITIALIZING");
  const [qrDataUrls, setQrDataUrls] = useState<string[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isAnimationPaused, setIsAnimationPaused] = useState<boolean>(false);
  const [copiedAnswer, setCopiedAnswer] = useState<boolean>(false);

  const [receivedAlert, setReceivedAlert] = useState<OfficialAlert | null>(
    null,
  );
  const [isDuplicate, setIsDuplicate] = useState<boolean>(false);
  const [transferProgress, setTransferProgress] =
    useState<TransferProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receivedPhotoUrl, setReceivedPhotoUrl] = useState<string | null>(null);

  const sessionRef = useRef<ReceiverPeerSession | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!isOpen) {
      cleanupSession();
      if (receivedPhotoUrl) {
        URL.revokeObjectURL(receivedPhotoUrl);
        setReceivedPhotoUrl(null);
      }
      return;
    }

    setStep(1);
    setErrorMessage(null);
    setTransferProgress(null);
    setReceivedAlert(null);
    setIsDuplicate(false);
  }, [isOpen, cleanupSession]);

  // Frame cycling animation for multi-frame QR codes
  useEffect(() => {
    if (animationTimerRef.current) {
      clearInterval(animationTimerRef.current);
      animationTimerRef.current = null;
    }

    if (qrDataUrls.length > 1 && !isAnimationPaused && step === 2) {
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

  // Handle scanned Offer SDP from Host
  const handleHostOfferScanned = async (scannedOfferSdp: string) => {
    try {
      setErrorMessage(null);
      setStep(2); // Show Answer QR

      let isCancelled = false;
      const cleanOffer = sanitizeSDP(scannedOfferSdp);

      const receiverSession = await initReceiverPeer(cleanOffer, {
        onStateChange: (state) => {
          if (!isCancelled) setConnState(state);
        },
        onError: (err) => {
          if (!isCancelled) setErrorMessage(err.message);
        },
      });

      sessionRef.current = receiverSession;
      setSession(receiverSession);

      // Render answer QR frames
      const frames = prepareQRFrames(receiverSession.answerSdp);
      const renderedUrls: string[] = [];
      for (const frame of frames) {
        const url = await renderQRCodeDataUrl(frame, { width: 360, margin: 4 });
        renderedUrls.push(url);
      }

      setQrDataUrls(renderedUrls);
      setCurrentFrameIndex(0);

      // Listen for DataChannel
      const dataChannel = await receiverSession.waitForDataChannel();
      setStep(3); // Transition to receiving state

      const result = await receiveAlertOverChannel(dataChannel, {
        onProgress: (progress) => {
          setTransferProgress(progress);
        },
      });

      setReceivedAlert(result.alert);
      setIsDuplicate(result.isDuplicate);

      const pUrl = URL.createObjectURL(result.alert.photoBlob);
      setReceivedPhotoUrl(pUrl);

      setStep(4); // Transfer completed!
      onAlertReceived?.(result.alert);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Handshake or transfer failed";
      setErrorMessage(msg);
      setStep(1); // Allow retry scan
    }
  };

  const handleCopyAnswerSdp = () => {
    if (!session?.answerSdp) return;
    navigator.clipboard.writeText(session.answerSdp);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border p-4 bg-muted/40">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <Inbox className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold tracking-tight">
                  Receive Official Alert
                </h3>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded-full bg-muted-foreground/10 text-muted-foreground">
                  {connState}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                P2P Optical Handshake • Offline Ingestion
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

          {/* STEP 1: SCAN HOST'S OFFER QR CODE */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="text-center space-y-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full">
                  Step 1 of 2: Scan Host Phone
                </span>
                <p className="text-xs text-muted-foreground">
                  Aim this camera at the Offer QR code displayed on the sender's
                  phone.
                </p>
              </div>

              <QRScannerView
                title="Scan Host Offer QR"
                description="Align the sender's offer QR within the frame"
                onScanComplete={handleHostOfferScanned}
                onCancel={onClose}
              />
            </div>
          )}

          {/* STEP 2: DISPLAY RECEIVER'S ANSWER QR CODE */}
          {step === 2 && (
            <div className="space-y-4 text-center">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-0.5 rounded-full">
                  Step 2 of 2: Host Scans Your Phone
                </span>
                <p className="text-xs text-muted-foreground">
                  Show this Answer QR to the sender's phone to open the WebRTC
                  DataChannel.
                </p>
              </div>

              {/* QR Display Frame */}
              <div className="relative mx-auto w-72 h-72 sm:w-80 sm:h-80 rounded-2xl border-2 border-border bg-white p-3 shadow-inner flex flex-col items-center justify-center">
                {qrDataUrls.length > 0 ? (
                  <img
                    src={qrDataUrls[currentFrameIndex]}
                    alt={`Receiver Answer QR ${currentFrameIndex + 1}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Radio className="h-8 w-8 animate-spin text-blue-600" />
                    <span className="text-[11px] font-medium text-black">
                      Generating answer SDP...
                    </span>
                  </div>
                )}

                {/* Animated frame badge if multi-frame */}
                {qrDataUrls.length > 1 && (
                  <div className="absolute bottom-0.5 rounded-full bg-black/85 px-3 py-0.5 text-[10px] font-mono text-white flex items-center gap-1.5 shadow-md">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-ping" />
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
                        (prev) =>
                          (prev - 1 + qrDataUrls.length) % qrDataUrls.length,
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
                        <Play className="h-3 w-3 text-blue-600" /> Resume Cycle
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
                        (prev) => (prev + 1) % qrDataUrls.length,
                      )
                    }
                    className="text-[10px] h-7 rounded-lg gap-1 px-2"
                  >
                    Next
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={handleCopyAnswerSdp}
                  className="text-[10px] text-muted-foreground gap-1"
                >
                  <Copy className="h-3 w-3" />
                  {copiedAnswer ? "Copied Answer SDP" : "Copy Raw Answer SDP"}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: RECEIVING DATA & PHOTO CHUNKS */}
          {step === 3 && (
            <div className="py-6 space-y-4 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600">
                <Share2 className="h-6 w-6 animate-bounce" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  Receiving Official Alert & Photo
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Reassembling binary chunks over direct P2P connection...
                </p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5 max-w-xs mx-auto">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-blue-600 transition-all duration-150 rounded-full"
                    style={{ width: `${transferProgress?.percent || 10}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span>
                    {transferProgress
                      ? `${Math.round(transferProgress.bytesTransferred / 1024)} KB / ${Math.round(transferProgress.totalBytes / 1024)} KB`
                      : "Receiving chunks..."}
                  </span>
                  <span>{transferProgress?.percent || 0}%</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: COMPLETED & DEDUP CHECK */}
          {step === 4 && receivedAlert && (
            <div className="space-y-4 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600">
                {isDuplicate ? (
                  <ShieldCheck className="h-7 w-7 text-blue-600" />
                ) : (
                  <CheckCircle className="h-7 w-7" />
                )}
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">
                  {isDuplicate
                    ? "Duplicate Alert Acknowledged"
                    : "Official Alert Received!"}
                </h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  {isDuplicate
                    ? "This alert ID was already cached on your phone. Deduplicated to prevent redundant storage."
                    : "Verified evidence photo and directive stored locally. You can now relay it onward."}
                </p>
              </div>

              {/* Alert Card Preview */}
              <div className="rounded-xl border border-border bg-card p-3 text-left space-y-2 shadow-sm">
                {receivedPhotoUrl && (
                  <div className="aspect-video w-full rounded-lg overflow-hidden bg-black/90">
                    <img
                      src={receivedPhotoUrl}
                      alt="Received evidence"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase">
                      {receivedAlert.hazardType}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-mono">
                      Hop #{receivedAlert.hopCount}
                    </span>
                  </div>
                  <p className="text-xs text-foreground mt-1 line-clamp-2">
                    {receivedAlert.message}
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  size="default"
                  onClick={onClose}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs h-10 shadow-md"
                >
                  View in Alerts Dashboard
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

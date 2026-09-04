import { compactSDP } from "./qr-signaling";

export const DATA_CHANNEL_LABEL = "dhr-alert-relay";
export const ICE_GATHERING_TIMEOUT_MS = 2000;

export type PeerRole = "HOST" | "RECEIVER";
export type PeerConnectionState =
  | "INITIALIZING"
  | "GATHERING_ICE"
  | "AWAITING_ANSWER"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "FAILED"
  | "CLOSED";

export interface HostPeerSession {
  role: "HOST";
  pc: RTCPeerConnection;
  dataChannel: RTCDataChannel;
  offerSdp: string;
  applyAnswerSdp: (answerSdp: string) => Promise<void>;
  close: () => void;
}

export interface ReceiverPeerSession {
  role: "RECEIVER";
  pc: RTCPeerConnection;
  answerSdp: string;
  waitForDataChannel: () => Promise<RTCDataChannel>;
  close: () => void;
}

/**
 * Helper to wait until ICE candidate gathering has completed
 * so that all host candidates on the local hotspot are embedded directly in the SDP.
 */
export function waitForIceGatheringComplete(
  pc: RTCPeerConnection,
  timeoutMs = ICE_GATHERING_TIMEOUT_MS
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const onIceStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    };

    const cleanup = () => {
      pc.removeEventListener("icegatheringstatechange", onIceStateChange);
      if (timer) clearTimeout(timer);
    };

    pc.addEventListener("icegatheringstatechange", onIceStateChange);

    // Guard timeout: resolve with whatever host candidates were gathered
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
  });
}

/**
 * Initializes the HOST WebRTC Peer Connection.
 * 1. Creates RTCPeerConnection with no STUN/TURN (offline hotspot mode).
 * 2. Creates the RTCDataChannel.
 * 3. Creates offer and gathers local host candidates.
 * 4. Returns completed offer SDP and a function to apply the receiver's answer.
 */
export async function initHostPeer(options?: {
  onChannelOpen?: (channel: RTCDataChannel) => void;
  onStateChange?: (state: PeerConnectionState) => void;
  onError?: (err: Error) => void;
}): Promise<HostPeerSession> {
  const pc = new RTCPeerConnection({
    iceServers: [], // Strictly offline / local network candidates
  });

  const dataChannel = pc.createDataChannel(DATA_CHANNEL_LABEL, {
    ordered: true,
  });
  dataChannel.binaryType = "arraybuffer";

  dataChannel.onopen = () => {
    options?.onStateChange?.("CONNECTED");
    options?.onChannelOpen?.(dataChannel);
  };

  dataChannel.onclose = () => {
    options?.onStateChange?.("CLOSED");
  };

  dataChannel.onerror = (evt) => {
    options?.onError?.(new Error("DataChannel error: " + JSON.stringify(evt)));
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === "connected") options?.onStateChange?.("CONNECTED");
    else if (s === "disconnected") options?.onStateChange?.("DISCONNECTED");
    else if (s === "failed") options?.onStateChange?.("FAILED");
  };

  options?.onStateChange?.("GATHERING_ICE");

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await waitForIceGatheringComplete(pc);

  const finalSdp = pc.localDescription?.sdp || offer.sdp || "";
  const compactedOfferSdp = compactSDP(finalSdp);

  options?.onStateChange?.("AWAITING_ANSWER");

  const applyAnswerSdp = async (answerSdp: string): Promise<void> => {
    options?.onStateChange?.("CONNECTING");
    const desc = new RTCSessionDescription({
      type: "answer",
      sdp: answerSdp,
    });
    await pc.setRemoteDescription(desc);
  };

  const close = () => {
    try {
      dataChannel.close();
      pc.close();
    } catch (e) {
      console.warn("Error closing host peer:", e);
    }
  };

  return {
    role: "HOST",
    pc,
    dataChannel,
    offerSdp: compactedOfferSdp,
    applyAnswerSdp,
    close,
  };
}

/**
 * Initializes the RECEIVER WebRTC Peer Connection.
 * 1. Takes the scanned offer SDP from the host.
 * 2. Sets remote description.
 * 3. Creates answer and gathers local host candidates.
 * 4. Produces completed answer SDP and waits for DataChannel onopen.
 */
export async function initReceiverPeer(
  offerSdp: string,
  options?: {
    onChannelOpen?: (channel: RTCDataChannel) => void;
    onStateChange?: (state: PeerConnectionState) => void;
    onError?: (err: Error) => void;
  }
): Promise<ReceiverPeerSession> {
  const pc = new RTCPeerConnection({
    iceServers: [],
  });

  let activeDataChannel: RTCDataChannel | null = null;
  let channelResolve: ((ch: RTCDataChannel) => void) | null = null;

  const dataChannelPromise = new Promise<RTCDataChannel>((resolve) => {
    channelResolve = resolve;
  });

  pc.ondatachannel = (event) => {
    const channel = event.channel;
    channel.binaryType = "arraybuffer";
    activeDataChannel = channel;

    channel.onopen = () => {
      options?.onStateChange?.("CONNECTED");
      options?.onChannelOpen?.(channel);
      channelResolve?.(channel);
    };

    channel.onclose = () => {
      options?.onStateChange?.("CLOSED");
    };

    channel.onerror = (evt) => {
      options?.onError?.(new Error("DataChannel error: " + JSON.stringify(evt)));
    };
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === "connected") options?.onStateChange?.("CONNECTED");
    else if (s === "disconnected") options?.onStateChange?.("DISCONNECTED");
    else if (s === "failed") options?.onStateChange?.("FAILED");
  };

  options?.onStateChange?.("GATHERING_ICE");

  const remoteDesc = new RTCSessionDescription({
    type: "offer",
    sdp: offerSdp,
  });
  await pc.setRemoteDescription(remoteDesc);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await waitForIceGatheringComplete(pc);

  const finalSdp = pc.localDescription?.sdp || answer.sdp || "";
  const compactedAnswerSdp = compactSDP(finalSdp);

  options?.onStateChange?.("CONNECTING");

  const close = () => {
    try {
      activeDataChannel?.close();
      pc.close();
    } catch (e) {
      console.warn("Error closing receiver peer:", e);
    }
  };

  return {
    role: "RECEIVER",
    pc,
    answerSdp: compactedAnswerSdp,
    waitForDataChannel: () => dataChannelPromise,
    close,
  };
}

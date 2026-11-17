import { RefObject } from "react";

export async function createRealtimeConnection(
  audioElement: RefObject<HTMLAudioElement | null>,
  hasAudio: boolean = true,
  model: string = "gpt-realtime",
  voice: string = "ballad",
  reasoningEffort?: string,
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel }> {
  const pc = new RTCPeerConnection();

  if (hasAudio) {
    pc.ontrack = (e) => {
      if (hasAudio && audioElement.current) {
        audioElement.current.srcObject = e.streams[0];
      }
    };

    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    ms.getTracks().forEach(track => pc.addTrack(track));
  } else {
    // For text-only mode, add a dummy audio transceiver to satisfy the API requirement
    pc.addTransceiver('audio', { direction: 'inactive' });
  }

  const dc = pc.createDataChannel("oai-events");

  // Always include audio in the offer, but mark it as inactive for text-only mode
  const offerOptions: RTCOfferOptions = { offerToReceiveAudio: true };
  const offer = await pc.createOffer(offerOptions);

  await pc.setLocalDescription(offer);

  // Wait for ICE candidate gathering to complete before sending the offer.
  // Chrome gathers candidates inline so skipping this works there, but
  // Firefox gathers asynchronously — sending an incomplete SDP can cause
  // ICE negotiation to use sub-optimal or missing candidates. Cap at 3 s
  // so a broken network environment can't stall indefinitely.
  if (pc.iceGatheringState !== "complete") {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", onStateChange);
        resolve();
      }, 3000);

      function onStateChange() {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          pc.removeEventListener("icegatheringstatechange", onStateChange);
          resolve();
        }
      }

      pc.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  // Realtime unified WebRTC API: the browser sends SDP to our authenticated
  // server endpoint, which forwards it as multipart form-data to OpenAI.
  // This avoids browser-side secret handling and cross-origin negotiation.
  const sdpResponse = await fetch("/api/realtime/call", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sdp: pc.localDescription!.sdp,
      model,
      modalities: hasAudio ? ["audio"] : ["text"],
      voice,
      reasoningEffort,
    }),
  });

  const answerSdp = await sdpResponse.text();
  if (!sdpResponse.ok) {
    let message = `Realtime negotiation failed (HTTP ${sdpResponse.status})`;
    try {
      const parsed = JSON.parse(answerSdp);
      if (typeof parsed.error === "string") message = parsed.error;
    } catch {
      // Plaintext upstream error.
    }
    pc.close();
    throw new Error(message);
  }
  if (!answerSdp.startsWith("v=0")) {
    pc.close();
    throw new Error("Realtime server returned an invalid SDP answer");
  }

  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  return { pc, dc };
} 
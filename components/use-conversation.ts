"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalAudioTrack, Room } from "livekit-client";
import { MAX_SESSION_SECONDS, type ConnectionDetails, type ConversationOptions } from "../lib/livekit/contracts";

export type TranscriptLine = { id: string; speaker: "You" | "Fluent"; text: string; final: boolean };
export type ConversationTake = { blob: Blob | null; turns: TranscriptLine[]; seconds: number };
type Status = "requesting" | "connecting" | "waiting" | "listening" | "thinking" | "speaking" | "reconnecting" | "ended" | "error";
type MicrophoneIssue = "permission" | "missing" | "busy" | "capture" | null;

const captureOptions = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
function microphoneFailure(cause: unknown): { issue: MicrophoneIssue; message: string } {
  const name = cause instanceof Error ? cause.name : "";
  if (["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(name)) return { issue: "permission", message: "Microphone access is off. Allow access in your browser or device settings, then try again." };
  if (["NotFoundError", "DevicesNotFoundError"].includes(name)) return { issue: "missing", message: "No microphone was found. Connect or enable a microphone, then try again." };
  if (["NotReadableError", "TrackStartError"].includes(name)) return { issue: "busy", message: "Your microphone couldn’t start. It may be in use by another app or unavailable. Check your input device, then try again." };
  return { issue: "capture", message: "Couldn’t start your microphone. Check your device’s microphone settings, then try again." };
}

export function useConversation({ prompt, focus, scenario, retry: rehearsalRetry, openingQuestion }: ConversationOptions) {
  const roomRef = useRef<Room | null>(null);
  const audioRoot = useRef<HTMLDivElement>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const agentAnalyser = useRef<AnalyserNode | null>(null);
  const recordingTracks = useRef<MediaStreamTrack[]>([]);
  const transcriptRef = useRef<TranscriptLine[]>([]);
  const complete = useRef<() => Promise<ConversationTake>>(async () => ({ blob: null, turns: [], seconds: 0 }));
  const dispose = useRef<() => void>(() => {});
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState("");
  const [microphoneIssue, setMicrophoneIssue] = useState<MicrophoneIssue>(null);
  const [microphonePermission, setMicrophonePermission] = useState<PermissionState | "unknown">("unknown");
  const [transcriptWarning, setTranscriptWarning] = useState("");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [muted, setMuted] = useState(false);
  const [changingMic, setChangingMic] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [checkingMic, setCheckingMic] = useState(false);
  const capture = useRef<typeof import("livekit-client").createLocalAudioTrack | null>(null);
  const preparedMicrophone = useRef<LocalAudioTrack | null>(null);
  const retrying = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    return () => {
      generation.current++;
      retrying.current = false;
      preparedMicrophone.current?.stop();
      preparedMicrophone.current = null;
    };
  }, [prompt, focus, scenario, rehearsalRetry, openingQuestion]);

  async function retry() {
    if (retrying.current) return;
    if (!microphoneIssue || !capture.current) { setAttempt(value => value + 1); return; }
    retrying.current = true;
    setCheckingMic(true);
    const id = generation.current;
    try {
      // A saved block cannot be overridden by repeatedly requesting capture.
      if (microphonePermission === "denied") {
        const permission = await navigator.permissions?.query({ name: "microphone" as PermissionName }).catch(() => null);
        if (id !== generation.current) return;
        setMicrophonePermission(permission?.state ?? "unknown");
        if (permission?.state === "denied") {
          setError("Microphone access is off. Change the microphone permission in your browser’s site settings before trying again.");
          return;
        }
      }
      // Keep the help screen stable until capture succeeds. Reuse this track
      // when connecting so a retry never asks for microphone access twice.
      const track = await capture.current(captureOptions);
      if (id !== generation.current) { track.stop(); return; }
      preparedMicrophone.current = track;
      setAttempt(value => value + 1);
    } catch (cause) {
      if (id !== generation.current) return;
      const failure = microphoneFailure(cause);
      setMicrophoneIssue(failure.issue); setError(failure.message);
    } finally {
      if (id === generation.current) { retrying.current = false; setCheckingMic(false); }
    }
  }

  useEffect(() => {
    if (microphoneIssue !== "permission") return;
    let active = true;
    let permission: PermissionStatus | undefined;
    const update = () => { if (active && permission) setMicrophonePermission(permission.state); };
    // Some browsers do not support querying microphone permissions. Capture
    // and the explicit retry still work when this optional check is unavailable.
    void navigator.permissions?.query({ name: "microphone" as PermissionName }).then(result => {
      if (!active) return;
      permission = result;
      update();
      permission.addEventListener("change", update);
    }).catch(() => {});
    return () => { active = false; permission?.removeEventListener("change", update); };
  }, [microphoneIssue, attempt]);

  useEffect(() => {
    let active = true;
    let room: Room | undefined;
    let microphone: LocalAudioTrack | undefined = preparedMicrophone.current ?? undefined;
    preparedMicrophone.current = null;
    let context: AudioContext | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let ticker: ReturnType<typeof setInterval> | undefined;
    let agentReady = false;
    let recorder: MediaRecorder | undefined;
    let recordingStream: MediaStream | undefined;
    let recording: Promise<Blob | null> = Promise.resolve(null);
    let started = Date.now();
    let finished: Promise<ConversationTake> | undefined;
    const abort = new AbortController();
    const audioElements = new Set<HTMLMediaElement>();

    const cleanup = () => {
      active = false;
      abort.abort();
      clearTimeout(deadline);
      clearInterval(ticker);
      if (recorder?.state !== "inactive" && recorder) recorder.stop();
      recordingStream?.getTracks().forEach(track => track.stop());
      recordingTracks.current = [];
      microphone?.stop();
      room?.removeAllListeners();
      room?.localParticipant.trackPublications.forEach((publication) => publication.track?.stop());
      void room?.disconnect().catch(() => {});
      audioElements.forEach((element) => { element.pause(); element.srcObject = null; element.remove(); });
      audioElements.clear();
      if (context) void context.close().catch(() => {});
      analyser.current = null;
      agentAnalyser.current = null;
      if (roomRef.current === room) roomRef.current = null;
    };
    dispose.current = cleanup;
    complete.current = () => {
      if (finished) return finished;
      finished = (async () => {
        const duration = Math.floor((Date.now() - started) / 1000);
        if (active && scenario) {
          await room?.localParticipant.setMicrophoneEnabled(false).catch(() => {});
          if (recorder && recorder.state !== "inactive") recorder.stop();
          // Let the final live transcription arrive before leaving the room.
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
        cleanup();
        const blob = await recording;
        setStatus("ended");
        return { blob, turns: transcriptRef.current.filter(line => line.final), seconds: duration };
      })();
      return finished;
    };
    const fail = (message: string) => {
      if (!active) return;
      setError(message);
      setStatus("error");
      cleanup();
    };

    setStatus(microphone ? "connecting" : "requesting"); setError(""); setMicrophoneIssue(null); setMicrophonePermission("unknown"); setTranscriptWarning(""); setTranscript([]);
    setSeconds(0); setMuted(false); setChangingMic(false); setAudioBlocked(false); transcriptRef.current = [];

    async function connect() {
      try {
        const { Room, RoomEvent, Track, ParticipantKind, createLocalAudioTrack } = await import("livekit-client");
        if (!active) return;
        if (!navigator.mediaDevices?.getUserMedia) {
          fail("Microphone access requires localhost or a secure connection."); return;
        }
        capture.current = createLocalAudioTrack;
        // Acquire permission before creating a room or dispatching the agent.
        try {
          microphone ||= await createLocalAudioTrack(captureOptions);
        } catch (cause) {
          if (!active) return;
          const failure = microphoneFailure(cause);
          setMicrophoneIssue(failure.issue);
          fail(failure.message);
          return;
        }
        if (!active) { microphone.stop(); return; }
        microphone.mediaStreamTrack.addEventListener("ended", () => {
          if (!active) return;
          setMicrophoneIssue("capture");
          fail("Your microphone disconnected or access was removed. Check its connection and permissions, then try again.");
        }, { once: true });
        setStatus("connecting");
        const response = await fetch("/api/livekit/token", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, focus, scenario, retry: rehearsalRetry, openingQuestion }), signal: abort.signal,
        });
        const details = await response.json() as ConnectionDetails & { error?: string };
        if (!active) return;
        if (!response.ok) { fail(details.error || "Couldn’t prepare your conversation."); return; }
        room = new Room({ audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        roomRef.current = room;
        const current = room;

        const updateAgent = () => {
          if (!active) return;
          const agent = [...current.remoteParticipants.values()].find((participant) => participant.kind === ParticipantKind.AGENT);
          const state = agent?.attributes["lk.agent.state"];
          if (state === "listening" || state === "thinking" || state === "speaking") {
            agentReady = true;
            clearTimeout(deadline);
            setStatus(state);
          } else {
            setStatus("waiting");
          }
        };
        current.on(RoomEvent.ParticipantConnected, updateAgent);
        current.on(RoomEvent.ParticipantAttributesChanged, updateAgent);
        current.on(RoomEvent.ParticipantDisconnected, (participant) => {
          if (participant.kind === ParticipantKind.AGENT) fail("Your conversation partner disconnected. You can try a new session.");
        });
        current.on(RoomEvent.Reconnecting, () => active && setStatus("reconnecting"));
        current.on(RoomEvent.Reconnected, updateAgent);
        current.on(RoomEvent.Disconnected, () => fail("The connection ended. Your microphone is off. You can try again."));
        current.on(RoomEvent.AudioPlaybackStatusChanged, (playing) => active && setAudioBlocked(!playing));
        current.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio || !active) return;
          const element = track.attach();
          audioElements.add(element);
          audioRoot.current?.appendChild(element);
          try {
            context ||= new AudioContext();
            const source = context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
            agentAnalyser.current = context.createAnalyser();
            agentAnalyser.current.fftSize = 256;
            source.connect(agentAnalyser.current);
          } catch { /* The visual is optional. */ }
        });
        current.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((element) => { audioElements.delete(element); element.remove(); });
        });
        current.on(RoomEvent.DataReceived, (_data, participant, _kind, topic) => {
          if (participant?.kind === ParticipantKind.AGENT && topic === "fluent.agent.error") {
            fail("The voice service is unavailable. Please try again in a moment.");
          }
        });
        current.registerTextStreamHandler("lk.transcription", async (reader, participant) => {
          const attributes = reader.info.attributes;
          const id = `${participant.identity}:${attributes?.["lk.segment_id"] || reader.info.id}`;
          const final = attributes?.["lk.transcription_final"] !== "false";
          const speaker = participant.identity === current.localParticipant.identity ? "You" : "Fluent";
          let text = "";
          const update = (isFinal: boolean) => {
            const line: TranscriptLine = { id, speaker, text, final: isFinal };
            const previous = transcriptRef.current;
            const existing = previous.find(item => item.id === id);
            if (existing?.final && !isFinal) return;
            transcriptRef.current = existing ? previous.map(item => item.id === id ? line : item) : [...previous, line];
            setTranscript(transcriptRef.current);
          };
          try {
            for await (const chunk of reader) {
              text += chunk;
              if (!active) return;
              update(false);
            }
            if (active) update(final);
          } catch {
            if (active) setTranscriptWarning("Part of the transcript couldn’t be received.");
          }
        });

        await current.connect(details.server_url, details.participant_token);
        if (!active) { await current.disconnect(); return; }
        await current.startAudio().catch(() => { if (active) setAudioBlocked(true); });
        if (!active) return;
        const publication = await current.localParticipant.publishTrack(microphone, { source: Track.Source.Microphone });
        if (!active) { publication?.track?.stop(); await current.disconnect(); return; }
        const mediaTrack = publication?.track?.mediaStreamTrack;
        started = Date.now();
        if (mediaTrack) {
          if (scenario && typeof MediaRecorder !== "undefined") {
            try {
              recordingStream = new MediaStream([mediaTrack.clone()]);
              recordingTracks.current = recordingStream.getTracks();
              recorder = new MediaRecorder(recordingStream);
              const pieces: BlobPart[] = [];
              const currentRecorder = recorder;
              recording = new Promise(resolve => {
                currentRecorder.ondataavailable = event => { if (event.data.size) pieces.push(event.data); };
                currentRecorder.onerror = () => resolve(null);
                currentRecorder.onstop = () => resolve(pieces.length ? new Blob(pieces, { type: currentRecorder.mimeType }) : null);
              });
              recorder.start();
            } catch { recording = Promise.resolve(null); }
          }
          try {
            context ||= new AudioContext();
            analyser.current = context.createAnalyser();
            analyser.current.fftSize = 256;
            context.createMediaStreamSource(new MediaStream([mediaTrack])).connect(analyser.current);
            await context.resume();
          } catch { /* Audio visualization is optional; the call can continue. */ }
        }
        if (!active) return;
        updateAgent();
        if (!agentReady) deadline = setTimeout(() => fail("Your conversation partner couldn’t join. Please try again once the voice service is running."), 30_000);
        ticker = setInterval(() => {
          const elapsed = Math.floor((Date.now() - started) / 1000);
          setSeconds(elapsed);
          if (elapsed >= (scenario ? rehearsalRetry ? 45 : 90 : MAX_SESSION_SECONDS)) { clearInterval(ticker); void complete.current(); }
        }, 1000);
      } catch (cause) {
        if (!active) return;
        fail("Couldn’t connect your voice session. Check your connection and try again.");
      }
    }
    void connect();
    return cleanup;
  }, [prompt, focus, scenario, rehearsalRetry, openingQuestion, attempt]);

  const finish = useCallback(() => complete.current(), []);
  async function toggleMic() {
    const room = roomRef.current;
    if (!room || changingMic) return;
    setChangingMic(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(muted);
      if (roomRef.current === room) { recordingTracks.current.forEach(track => { track.enabled = muted; }); setMuted(!muted); }
    } catch {
      if (roomRef.current === room) { dispose.current(); setError("Couldn’t change microphone access. The session has ended."); setStatus("error"); }
    } finally { setChangingMic(false); }
  }
  async function enableAudio() {
    try { await roomRef.current?.startAudio(); }
    catch { setAudioBlocked(true); }
  }

  return { status, error, checkingMic, microphoneIssue, microphonePermission, transcriptWarning, transcript, muted, changingMic, audioBlocked, seconds,
    audioRoot, analyser, agentAnalyser, finish, toggleMic, enableAudio, retry };
}

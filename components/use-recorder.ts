"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecordedAudio = { url: string; blob: Blob };

export function useRecorder() {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const urls = useRef<string[]>([]);
  const mounted = useRef(true);
  const generation = useRef(0);
  const finishPending = useRef<((take: RecordedAudio | null) => void) | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void context.current?.close().catch(() => {});
    context.current = null;
    analyser.current = null;
  }, []);

  const cancel = useCallback(() => {
    generation.current++;
    finishPending.current?.(null);
    finishPending.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    release();
    if (mounted.current) setPending(false);
  }, [release]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [cancel]);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn’t available in this browser. You can still explore the demo.");
      return false;
    }
    setPending(true);
    const request = ++generation.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || request !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return false;
      }
      stream.current = media;
      const current = new MediaRecorder(media);
      recorder.current = current;
      const chunks: BlobPart[] = [];
      current.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      current.onerror = () => {
        if (request !== generation.current) return;
        finishPending.current?.(null); finishPending.current = null;
        release();
        if (mounted.current) setError("The recording stopped unexpectedly. Please try again.");
      };
      current.onstop = () => {
        if (request !== generation.current) return;
        release();
        const resolve = finishPending.current;
        finishPending.current = null;
        if (!resolve) return;
        if (!chunks.length || !mounted.current) { resolve(null); return; }
        const blob = new Blob(chunks, { type: current.mimeType });
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        resolve({ url, blob });
      };
      try {
        context.current = new AudioContext();
        analyser.current = context.current.createAnalyser();
        analyser.current.fftSize = 256;
        context.current.createMediaStreamSource(media).connect(analyser.current);
      } catch {
        // Recording still works if the browser cannot provide a visualizer.
      }
      recorder.current.start();
      return true;
    } catch (cause) {
      release();
      if (mounted.current && request === generation.current) {
        setError(cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone access is off. Allow it in your browser, or explore the demo."
          : "We couldn’t reach your microphone. Check that it’s connected, or explore the demo.");
      }
      return false;
    } finally {
      if (mounted.current && request === generation.current) setPending(false);
    }
  }

  function pause(paused: boolean) {
    const current = recorder.current;
    if (paused && current?.state === "recording") current.pause();
    if (!paused && current?.state === "paused") current.resume();
  }

  function finishRecording(): Promise<RecordedAudio | null> {
    return new Promise((resolve) => {
      const current = recorder.current;
      if (!current || current.state === "inactive") { release(); resolve(null); return; }
      if (finishPending.current) { resolve(null); return; }
      finishPending.current = resolve;
      current.stop();
    });
  }

  async function finish() { return (await finishRecording())?.url ?? null; }

  return { start, pause, finish, finishRecording, cancel, analyser, error, pending };
}

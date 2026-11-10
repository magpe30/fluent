"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_RECORDING_SECONDS, type Assessment, type Evidence } from "../lib/assessment/contracts";
import { prepareRecording } from "../lib/assessment/prepare-recording";
import { formatTime, type Focus } from "../lib/practice";
import { useRecorder, type RecordedAudio } from "./use-recorder";
import { Waveform } from "./waveform";
import { Button } from "./ui/button";
import { Icon } from "./icons";

type Take = RecordedAudio & { seconds: number; assessment?: Assessment };
type Phase = "starting" | "recording" | "stopping" | "review" | "analyzing" | "feedback";

export function SpeakingPractice({ prompt, focus, onBack, onDone }: {
  prompt: string; focus: Focus; onBack: () => void; onDone: () => void;
}) {
  const recorder = useRecorder();
  const [phase, setPhase] = useState<Phase>("starting");
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [first, setFirst] = useState<Take | null>(null);
  const [exercise, setExercise] = useState<string | null>(null);
  const [error, setError] = useState("");
  const operation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const elapsed = useRef(0);
  const resumedAt = useRef(0);
  const stopping = useRef(false);
  const finishRef = useRef<() => void>(() => {});
  const player = useRef<HTMLAudioElement>(null);
  const excerptEnd = useRef<number | null>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    void begin();
    return () => { operation.current++; request.current?.abort(); };
    // Start once per mounted practice session. The recorder handles late mic grants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [phase]);
  useEffect(() => {
    if (phase !== "recording" || paused) return;
    const timer = setInterval(() => {
      const value = Math.floor((elapsed.current + Date.now() - resumedAt.current) / 1000);
      setSeconds(Math.min(MAX_RECORDING_SECONDS, value));
      if (value >= MAX_RECORDING_SECONDS) finishRef.current();
    }, 200);
    return () => clearInterval(timer);
  }, [phase, paused]);

  async function begin() {
    const id = ++operation.current;
    request.current?.abort();
    setError(""); setTake(null); setSeconds(0); setPaused(false); setPhase("starting");
    elapsed.current = 0; stopping.current = false; excerptEnd.current = null;
    const started = await recorder.start();
    if (id !== operation.current) return;
    if (started) { resumedAt.current = Date.now(); setPhase("recording"); }
    else setPhase("review");
  }
  async function finish() {
    if (stopping.current) return;
    stopping.current = true;
    const id = operation.current;
    const duration = Math.min(MAX_RECORDING_SECONDS, Math.floor((elapsed.current + (paused ? 0 : Date.now() - resumedAt.current)) / 1000));
    setPhase("stopping");
    const audio = await recorder.finishRecording();
    if (id !== operation.current) return;
    if (audio) setTake({ ...audio, seconds: duration });
    else setError("No audio was captured. Please record another take.");
    setSeconds(duration); setPhase("review");
  }
  finishRef.current = () => { void finish(); };
  function togglePause() {
    recorder.pause(!paused);
    if (!paused) elapsed.current += Date.now() - resumedAt.current;
    else resumedAt.current = Date.now();
    setPaused(!paused);
  }
  async function analyze() {
    if (!take || phase === "analyzing") return;
    const id = ++operation.current;
    const abort = new AbortController();
    request.current = abort;
    const timer = setTimeout(() => abort.abort(), 225_000);
    setError(""); setPhase("analyzing");
    try {
      const wav = await prepareRecording(take.blob);
      if (id !== operation.current) return;
      const form = new FormData();
      form.set("audio", wav, "practice.wav"); form.set("prompt", exercise || prompt); form.set("consent", "true");
      const response = await fetch("/api/assessment", { method: "POST", body: form, signal: abort.signal });
      const result = await response.json();
      if (id !== operation.current) return;
      if (!response.ok) throw new Error(result.error || "Feedback is unavailable. Please try again.");
      setTake({ ...take, assessment: result as Assessment });
      setPhase("feedback");
    } catch (cause) {
      if (id !== operation.current) return;
      setError(abort.signal.aborted ? "Feedback took too long. Your recording is still here; you can try again." : cause instanceof Error ? cause.message : "Feedback is unavailable. Please try again.");
      setPhase("review");
    } finally { clearTimeout(timer); }
  }
  function retry() {
    if (take?.assessment?.status === "ready") {
      if (!first) setFirst(take);
      setExercise(take.assessment.exercise);
    }
    void begin();
  }
  function playEvidence(evidence: Evidence) {
    const audio = player.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, evidence.start - .15);
    excerptEnd.current = evidence.end + .2;
    void audio.play().catch(() => setError("Use the audio player to listen to this moment."));
  }
  const result = take?.assessment;
  const recording = phase === "recording" || phase === "starting" || phase === "stopping";

  return <section className={`speaking-practice enter ${recording ? "practice-content" : "feedback-content"}`}>
    <div className="session-meta"><span>{exercise ? "ONE MORE TRY" : "SPEAK FREELY"}</span><span className="session-time">{formatTime(seconds)} / 02:00</span></div>
    <div className={recording ? "practice-heading" : "assessment-heading"}>
      <span className="eyebrow">{recording ? exercise ? "YOUR EXERCISE" : "THE FLOOR IS YOURS" : phase === "analyzing" ? "A MOMENT TO LISTEN" : result?.status === "ready" ? "WORDS THAT WORK FOR YOU" : "YOUR RECORDING"}</span>
      <h1 ref={title} tabIndex={-1}>{recording ? exercise || prompt : phase === "analyzing" ? "Finding useful feedback…" : result?.status === "ready" ? "One idea. A clearer way to say it." : "Listen back. Take your time."}</h1>
    </div>
    {recording && <>
      <div className="voice-area"><Waveform active={phase === "recording" && !paused} analyser={recorder.analyser}/><p className="listening-state" role="status">{phase === "starting" ? "Connecting microphone…" : phase === "stopping" ? "Preparing your recording…" : paused ? "Paused · take a breath" : "Recording · aim for 20–60 seconds"}</p></div>
      <div className="practice-controls"><Button variant="secondary" onClick={togglePause} disabled={phase !== "recording"}><Icon name={paused ? "play" : "pause"} size={19}/>{paused ? "Continue" : "Pause"}</Button><Button variant="primary" onClick={finish} disabled={phase !== "recording"}><Icon name="stop" size={19}/>Finish recording</Button></div>
      <p className="privacy-note conversation-note">Your recording stays in this tab until you choose to send it for feedback.</p>
    </>}
    {take && <div className="take-player"><div className="take-label"><strong>{first ? "Your new take" : "Your recording"}</strong><span>{formatTime(take.seconds)}</span></div>
      <audio ref={player} aria-label="Your recording" controls src={take.url} preload="metadata" onTimeUpdate={() => {
        if (player.current && excerptEnd.current !== null && player.current.currentTime >= excerptEnd.current) { player.current.pause(); excerptEnd.current = null; }
      }} onEnded={() => { excerptEnd.current = null; }}/>
    </div>}
    {phase === "review" && take && <div className="assessment-consent">
      <p>Get feedback on sentence structure and word choice. Sending this recording lets LiveKit and its AI providers transcribe and analyze it. Fluent processes it in memory and does not save a server copy.</p>
      <p className="privacy-note">{focus === "delivery" ? "You chose delivery. This first version provides language feedback; voice and delivery measurements are coming next." : "This first version focuses on your words and sentences. It doesn’t assess pronunciation or vocal delivery."}</p>
      <Button variant="primary" onClick={analyze}>Send recording for feedback</Button>
    </div>}
    {phase === "analyzing" && <div className="assessment-progress" role="status"><p>Transcribing your recording, then checking the wording. Allow roughly the length of your recording, plus a little time for feedback.</p><Button variant="ghost" onClick={() => { operation.current++; request.current?.abort(); setPhase("review"); }}>Cancel analysis</Button></div>}
    {phase === "feedback" && result && <>
      {result.status === "insufficient_evidence" ? <p className="assessment-notice" role="status">{result.message}</p> : <>
        {result.strength && <div className="assessment-card assessment-strength"><span className="eyebrow">WHAT WORKED</span><h2>{result.strength.title}</h2><blockquote>“{result.strength.evidence.quote}”</blockquote><p>{result.strength.explanation}</p><Button variant="ghost" onClick={() => playEvidence(result.strength!.evidence)}><Icon name="play" size={16}/>Listen to this moment</Button></div>}
        {result.suggestions.map((suggestion, index) => <div className="assessment-card" key={index}>
          <div className="assessment-card-meta"><span className="eyebrow">{suggestion.category === "sentence_structure" ? "SENTENCE STRUCTURE" : "WORD USAGE"}</span><span className="sample-badge">{suggestion.kind === "correction" ? "Correction" : "Optional style suggestion"}</span></div>
          <dl className="assessment-rewrite"><dt>You said</dt><dd>“{suggestion.evidence.quote}”</dd><dt>Try</dt><dd>“{suggestion.replacement}”</dd></dl>
          <p>{suggestion.explanation}</p><Button variant="ghost" onClick={() => playEvidence(suggestion.evidence)}><Icon name="play" size={16}/>Listen to the original</Button>
        </div>)}
        {!result.suggestions.length && <p className="privacy-note">No specific sentence or word changes stood out in this take.</p>}
        <div className="assessment-card assessment-exercise"><span className="eyebrow">ONE THING TO TRY</span><p>{result.exercise}</p></div>
      </>}
      {!!result.transcript.length && <details className="assessment-transcript"><summary>Check the transcript</summary><p className="privacy-note">Transcription can mishear words. Replay the audio before accepting a correction.</p>{result.transcript.map((segment) => <p key={segment.id}>{segment.text}</p>)}</details>}
      {first && <div className="assessment-card"><span className="eyebrow">COMPARE YOUR TAKES</span><p>Listen for the change you practiced. Different wording isn’t automatically better.</p><p className="privacy-note">Your first take</p><audio controls src={first.url} aria-label="Your first take"/><p className="privacy-note">The feedback above describes your new take. No improvement score is assigned.</p></div>}
    </>}
    {(error || recorder.error) && <p className="error-message" role="alert">{error || recorder.error}</p>}
    {!recording && phase !== "analyzing" && <div className="feedback-actions"><Button variant={phase === "feedback" || !take ? "primary" : "secondary"} onClick={retry}><Icon name="refresh" size={18}/>{result?.status === "ready" ? "Try this exercise" : "Record again"}</Button>{phase === "feedback" && <Button variant="ghost" onClick={onDone}>Done for now</Button>}</div>}
    <div className="practice-extras"><Button variant="ghost" size="sm" color="var(--muted)" onClick={onBack}>Discard session and go back</Button></div>
  </section>;
}

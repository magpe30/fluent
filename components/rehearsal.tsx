"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import { Planet, type CloudSignal } from "./planet";
import { Starfield } from "./starfield";
import { PageLoader } from "./page-loader";
import { Button } from "./ui/button";
import { ScrollHeader } from "./ui/scroll-header";
import { VocabularyFeedback } from "./vocabulary-feedback";
import { AlexAvatar } from "./alex-avatar";
import { MAX_SESSION_SECONDS } from "../lib/livekit/contracts";
import { Icon } from "./icons";
import { HeadingAccent } from "./heading-accent";
import { MicrophoneHelp } from "./microphone-help";
import { useConversation, type ConversationTake } from "./use-conversation";
import { MEETING_PROMPT, type MeetingFeedback, type MeetingTurn } from "../lib/rehearsal";
import { demoFeedback, demoTurns } from "../lib/rehearsal-demo";
import { formatTime } from "../lib/practice";

type Phase = "brief" | "prepare" | "live" | "review" | "feedback" | "retry" | "done";
type Take = { url: string | null; turns: MeetingTurn[]; seconds: number; feedback?: MeetingFeedback };
type Visual = { state: string; mic: AnalyserNode | null; agent: AnalyserNode | null; demo: boolean };
const labels: Record<string, string> = { requesting: "Allow microphone access in your browser to begin", connecting: "Joining your conversation", waiting: "Alex is joining", listening: "Your turn. Take your time.", thinking: "Alex is considering your point", speaking: "Alex is speaking · you can interrupt", reconnecting: "Reconnecting", finishing: "Finishing your transcript · microphone is off", ended: "Microphone is off", error: "Microphone is off" };

export function Rehearsal() {
  const [phase, setPhase] = useState<Phase>("brief");
  const [demo, setDemo] = useState(false);
  const [scenario, setScenario] = useState("");
  const prompt = demo ? MEETING_PROMPT : scenario.trim();
  const [takes, setTakes] = useState<Take[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [small, setSmall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const shell = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const angle = useRef(-.24);
  const signal = useRef<CloudSignal>({ energy: 0, presence: 0 });
  const visual = useRef<Visual>({ state: "idle", mic: null, agent: null, demo: false });
  const urls = useRef<string[]>([]);
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const current = takes[attempt];
  const feedback = current?.feedback;
  const cloudReady = useCallback((n: number) => setProgress(p => Math.max(p, n)), []);
  const reveal = useCallback(() => setReady(true), []);
  const onVisual = useCallback((v: Visual) => { visual.current = v; }, []);

  useEffect(() => {
    let active = true;
    void document.fonts.ready.then(() => { if (active) setFontsReady(true); });
    const motion = matchMedia("(prefers-reduced-motion: reduce)"), mobile = matchMedia("(max-width: 760px)");
    const update = () => { setReduced(motion.matches); setSmall(mobile.matches); };
    update(); motion.addEventListener("change", update); mobile.addEventListener("change", update);
    return () => { active = false; motion.removeEventListener("change", update); mobile.removeEventListener("change", update); operation.current++; controller.current?.abort(); urls.current.forEach(URL.revokeObjectURL); };
  }, []);

  useEffect(() => {
    let frame = 0, previous = 0;
    const samples = new Uint8Array(256);
    const animate = (now: number) => {
      const delta = previous ? Math.min(now - previous, 50) : 0; previous = now;
      if (!document.hidden) {
        const v = visual.current;
        const source = v.state === "speaking" ? v.agent : v.mic;
        let energy = 0;
        if (source) { source.getByteTimeDomainData(samples); energy = Math.min(1, Math.sqrt(samples.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / samples.length) * 5); }
        if (v.demo && ["speaking", "listening"].includes(v.state)) energy = .25 + Math.sin(now * .007) ** 2 * .3;
        signal.current.energy += ((reduced ? 0 : energy) - signal.current.energy) * .16;
        signal.current.presence += ((v.state === "speaking" ? 1 : 0) - signal.current.presence) * .06;
        if (!reduced) angle.current += delta * (v.state === "thinking" ? .00016 : .000055);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);

  useLayoutEffect(() => {
    const entrance = ready ? gsap.fromTo(content.current, { opacity: 0, y: reduced ? 0 : 16 }, { opacity: 1, y: 0, duration: reduced ? 0 : .65, delay: reduced ? 0 : .12, ease: "power2.out" }) : null;
    return () => { entrance?.kill(); };
  }, [phase, small, reduced, ready]);
  useEffect(() => {
    if (phase !== "live") visual.current = { state: busy ? "thinking" : "idle", mic: null, agent: null, demo: false };
  }, [phase, busy]);
  useEffect(() => {
    if (!ready) return;
    (content.current?.querySelector("h1") as HTMLElement | null)?.focus({ preventScroll: true });
    content.current?.scrollTo({ top: 0, behavior: "instant" });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [phase, ready]);

  function reset() {
    operation.current++; controller.current?.abort();
    urls.current.forEach(URL.revokeObjectURL); urls.current = [];
    setTakes([]); setAttempt(0); setError(""); setBusy(false); setPhase("brief");
  }
  function back() {
    operation.current++; controller.current?.abort(); setBusy(false); setError("");
    if (phase === "prepare") setPhase("brief");
    else if (phase === "live") { setPhase(attempt ? "retry" : "prepare"); if (attempt) setAttempt(0); }
    else if (phase === "retry") setPhase("feedback");
    else if (phase === "done") setPhase(feedback ? "feedback" : "prepare");
    else setPhase("prepare");
  }
  function prepare(isDemo: boolean) {
    if (!isDemo && !scenario.trim()) return;
    setDemo(isDemo); setError(""); setPhase("prepare");
  }
  async function review(take: Take, index = attempt) {
    const id = ++operation.current;
    controller.current?.abort();
    setBusy(true); setError(""); setPhase("review");
    if (demo) {
      setTakes(previous => { const next = [...previous]; next[index] = { ...take, feedback: demoFeedback[Math.min(index, 1)] }; return next; });
      setBusy(false); setPhase("feedback"); return;
    }
    const abort = new AbortController(); controller.current = abort;
    const timer = setTimeout(() => abort.abort(), 80_000);
    try {
      const response = await fetch("/api/rehearsal/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, turns: take.turns, ...(index > 0 ? { first: takes[0].turns } : {}) }), signal: abort.signal });
      const result = await response.json();
      if (id !== operation.current) return;
      if (!response.ok) throw Error(result.error || "Feedback is unavailable.");
      setTakes(previous => { const next = [...previous]; next[index] = { ...take, feedback: result }; return next; });
      setPhase("feedback");
    } catch (cause) { if (id === operation.current) setError(abort.signal.aborted ? "That took longer than expected. Your take is still here; try feedback again." : cause instanceof Error ? cause.message : "Feedback is unavailable."); }
    finally { clearTimeout(timer); if (id === operation.current) setBusy(false); }
  }
  function finish(take: ConversationTake | null) {
    let url: string | null = null;
    if (take?.blob) { url = URL.createObjectURL(take.blob); urls.current.push(url); }
    const value: Take = { url, turns: demo ? demoTurns[Math.min(attempt, 1)] : (take?.turns || []).map(({ speaker, text }) => ({ speaker, text })), seconds: take?.seconds || 0 };
    setTakes(previous => { const next = [...previous]; next[attempt] = value; return next; });
    void review(value);
  }
  const step = phase === "brief" || phase === "prepare" ? 0 : phase === "live" ? attempt ? 3 : 1 : phase === "retry" ? 3 : phase === "done" ? 4 : attempt ? 4 : 2;

  return <>
    <PageLoader progress={Math.floor(progress * .9) + (fontsReady ? 10 : 0)} revealed={ready} onComplete={reveal}/>
    <div ref={shell} className={`rehearsal ${phase === "brief" ? "is-brief" : ""} ${ready ? "is-ready" : "is-loading"}`} inert={!ready} aria-hidden={!ready}>
      <Starfield still={reduced || phase !== "brief"}/>
      <a className="skip-link" href="#rehearsal-main">Skip to practice</a>
      <ScrollHeader className="rehearsal-header" sticky={phase !== "brief"}>
        <button className="rehearsal-brand" onClick={reset} aria-label="Fluent home"><img src="/brand/fluent-lips-mint.svg" width="42" height="42" alt=""/>fluent<span>.</span></button>
        {phase !== "brief" && <nav className="rehearsal-navigation" aria-label="Practice navigation">{demo && <span className="rehearsal-tag">Scripted demo</span>}<Button variant="ghost" onClick={back}><Icon name="back" size={20}/>Back</Button></nav>}
      </ScrollHeader>
      <main id="rehearsal-main" className={`rehearsal-stage phase-${phase}`}>
        {phase === "brief" && <FloatingMouths angle={angle} onProgress={cloudReady}/>}
        <div ref={content} className="rehearsal-content">
          {phase === "brief" && <section className="rehearsal-brief">
            <h1 ref={title} tabIndex={-1}>Make room<br/>for your <HeadingAccent>point</HeadingAccent></h1>
            <p className="rehearsal-intro">You know what you want to say. Find a way to say it that feels like you.</p>
            <form className="scenario-form" onSubmit={event => { event.preventDefault(); prepare(false); }}>
              <label className="scenario-instruction" htmlFor="scenario">Describe who you’re speaking with and what you’d like to practice saying.</label>
              <div className="scenario-editor">
              <textarea id="scenario" required maxLength={4000} rows={4} value={scenario} onChange={event => setScenario(event.target.value)} placeholder="I’m meeting a client who wants to change the project scope. I want to explain why we need more time, without sounding unhelpful."/>
              <Button type="button" variant="ghost" size="sm" className="scenario-example" onClick={() => setScenario(MEETING_PROMPT)}>Use an example</Button>
              </div>
              <div className="rehearsal-actions"><Button type="submit" variant="primary" disabled={!scenario.trim()}>Prepare conversation <Icon name="arrow" size={18}/></Button><Button type="button" variant="secondary" onClick={() => prepare(true)}><Icon name="play" size={17}/>Try the demo</Button></div>
            </form>
          </section>}
          {phase === "prepare" && <section className="rehearsal-reflection rehearsal-prepare">
            <span className="rehearsal-kicker">{demo ? "A preview of the experience" : "Your scene is set · Microphone off"}</span>
            <h1 tabIndex={-1}>A conversation. <HeadingAccent>On your terms.</HeadingAccent></h1>
            <div className="scenario-preview"><h2>{demo ? "The deadline conversation" : "Your situation"}</h2><p>{prompt}</p></div>
            <div className="alex-introduction">
              <AlexAvatar size="sm"/>
              <div><h2>Meet Alex</h2><p>Your AI conversation partner</p></div>
            </div>
            <p className="rehearsal-intro">{demo ? "Meet Alex in a short sample conversation, then explore the feedback. No microphone needed." : "Talk about your day, explore an idea, or practise a situation. Alex will follow your lead and help when you’re searching for a word."}</p>
            {!demo && <p className="conversation-invitation">Talk for up to {MAX_SESSION_SECONDS / 60} minutes, and finish whenever you like. Afterwards, discover useful words and more natural ways to say what you mean.</p>}
            <div className="rehearsal-actions"><Button variant="primary" onClick={() => setPhase("live")}><Icon name={demo ? "play" : "mic"} size={19}/>{demo ? "Start demo" : "Start conversation"}</Button><Button variant="secondary" onClick={() => setPhase("brief")}>{demo ? "Back to my scenario" : "Edit scenario"}</Button></div>
            {!demo && <p className="rehearsal-fineprint">When you start, your browser will ask for microphone access if you haven’t already allowed it. Live audio is processed by LiveKit and its AI providers; your playback recording stays in this tab.</p>}
          </section>}
          {phase === "live" && (demo ? <DemoMeeting key={attempt} retry={attempt > 0} onFinish={() => finish(null)} onExit={reset} onVisual={onVisual}/> : <LiveMeeting key={attempt} prompt={prompt} openingQuestion={attempt ? takes[0]?.turns.find(turn => turn.speaker === "Fluent")?.text : undefined} retry={attempt > 0} onFinish={finish} onExit={reset} onVisual={onVisual}/>)}
          {phase === "review" && <section className="rehearsal-reflection"><span className="rehearsal-kicker">A MOMENT TO REFLECT</span><h1 ref={title} tabIndex={-1}>{busy ? <>Finding the words that <HeadingAccent>work for you.</HeadingAccent></> : <>Your take is <HeadingAccent>still here.</HeadingAccent></>}</h1><p className="rehearsal-intro">{busy ? "Looking at your sentences and word choices. Your microphone is off." : "You can listen back or try the feedback again."}</p>{busy && <div className="review-pulse" role="status"><span/><span/><span/><span/>Preparing your feedback</div>}{error && <p className="rehearsal-error" role="alert">{error}</p>}{current && <TakeAudio take={current} label="Your recording"/>}<div className="rehearsal-actions">{!busy && current && <Button variant="primary" onClick={() => review(current)}>Try feedback again</Button>}<Button variant="ghost" onClick={() => { operation.current++; controller.current?.abort(); setBusy(false); setError(""); setPhase("done"); }}>Finish without feedback</Button></div>{current && <Transcript turns={current.turns}/>}</section>}
          {phase === "feedback" && feedback && <section className="rehearsal-reflection">
            <span className="rehearsal-kicker">{demo ? "SAMPLE FEEDBACK · SCRIPTED DEMO" : attempt ? "YOUR SECOND TAKE" : "A MOMENT TO REFLECT"}</span>
            <h1 ref={title} tabIndex={-1}>{attempt ? <>Same idea. <HeadingAccent>A fresh way to say it.</HeadingAccent></> : <>Your point. <HeadingAccent>A little clearer.</HeadingAccent></>}</h1>
            <p className="rehearsal-intro">{feedback.status === "ready" ? "Keep what sounds like you. Try what helps." : "We need a little more clear speech to offer useful feedback."}</p>
            {feedback.strength && <article className="rehearsal-strength"><span className="feedback-symbol">✳</span><div><span className="rehearsal-kicker">KEEP THIS</span><h2>{feedback.strength.title}</h2><blockquote>“{feedback.strength.quote}”</blockquote><p>{feedback.strength.explanation}</p></div></article>}
            <div className="rehearsal-suggestions">{feedback.suggestions.map((s, i) => <article className="rehearsal-suggestion" key={i}><div className="suggestion-heading"><span>{s.category === "sentence_structure" ? "SENTENCE STRUCTURE" : "WORD CHOICE"}</span><span className="suggestion-kind">{s.kind === "correction" ? "Correction" : "Optional phrasing"}</span></div><dl><dt>YOU SAID</dt><dd>“{s.quote}”</dd><dt>YOU COULD SAY</dt><dd>“{s.replacement}”</dd></dl><p>{s.explanation}</p></article>)}</div>
            {feedback.status === "ready" && !feedback.suggestions.length && <p className="rehearsal-fineprint">No specific sentence or word changes stood out in this take.</p>}
            {feedback.status === "ready" && <VocabularyFeedback items={feedback.vocabulary}/> }
            {attempt > 0 && <div className="rehearsal-comparison"><span className="rehearsal-kicker">HEAR THE DIFFERENCE</span>{feedback.comparison ? <><div className="comparison-quotes"><blockquote><small>FIRST TAKE</small>“{feedback.comparison.before}”</blockquote><blockquote><small>SECOND TAKE</small>“{feedback.comparison.after}”</blockquote></div><p>{feedback.comparison.observation}</p></> : <p>Compare both takes in the transcripts. Which wording feels more natural to you?</p>}<div className="comparison-players"><TakeAudio take={takes[0]} label="First take"/><TakeAudio take={current} label="Second take"/></div></div>}
            {!attempt && <TakeAudio take={current} label="Replay your answers"/>}
            <div className="rehearsal-next"><span className="rehearsal-kicker">{attempt ? "TAKE IT INTO YOUR NEXT CONVERSATION" : "ONE THING TO TRY"}</span><p>{feedback.exercise}</p><div className="rehearsal-actions">{!attempt && <Button variant="primary" onClick={() => setPhase("retry")}>Try that answer again <Icon name="arrow" size={17}/></Button>}<Button variant={attempt ? "primary" : "secondary"} onClick={() => setPhase("done")}>Finish practice {attempt ? <Icon name="check" size={17}/> : null}</Button></div></div>
            <Transcript turns={current.turns}/><p className="rehearsal-fineprint">{demo ? "An illustrative example. No microphone or AI request was used." : "Feedback uses an automatic transcript and may mishear words. Check your recording before accepting a correction. We assess wording, not pronunciation or confidence."}</p>
          </section>}
          {phase === "retry" && <section className="rehearsal-reflection retry-brief"><span className="rehearsal-kicker">SAME QUESTION. ANOTHER CHANCE.</span><h1 ref={title} tabIndex={-1}>Keep the idea. <HeadingAccent>Try the words.</HeadingAccent></h1><p className="rehearsal-intro">Alex will ask the opening question again.<br/>Take up to 45 seconds. One answer is enough.</p><div className="retry-exercise"><span className="rehearsal-kicker">YOUR FOCUS</span><p>{feedback?.exercise}</p></div><div className="rehearsal-actions"><Button variant="primary" onClick={() => { setAttempt(1); setPhase("live"); }}>Start second take <Icon name="arrow" size={17}/></Button><Button variant="secondary" onClick={() => setPhase("feedback")}>Look at feedback</Button></div></section>}
          {phase === "done" && <section className="rehearsal-reflection rehearsal-done"><span className="rehearsal-kicker">A LITTLE PRACTICE, DONE.</span><h1 ref={title} tabIndex={-1}>Your next conversation. <HeadingAccent>A little more room.</HeadingAccent></h1><p className="rehearsal-intro">You made time to find your words.<br/>Take the phrasing that felt useful with you.</p>{feedback?.exercise && <div className="retry-exercise"><span className="rehearsal-kicker">A THOUGHT TO TAKE WITH YOU</span><p>{feedback.exercise}</p></div>}<div className="rehearsal-actions"><Button variant="primary" onClick={reset}>Practice again <Icon name="refresh" size={17}/></Button>{feedback && <Button variant="secondary" onClick={() => setPhase("feedback")}>Revisit your feedback</Button>}</div><p className="rehearsal-fineprint">Your microphone is off. Starting again or closing this page clears your takes.</p></section>}
        </div>
      </main>
      <footer className="rehearsal-footer"><ol aria-label="Rehearsal progress">{["Prepare", "Practice", "Reflect", "Try again", "Take it with you"].map((label, i) => <li key={label} aria-current={step === i ? "step" : undefined} className={step === i ? "active" : step > i ? "passed" : ""}><span>{label}</span></li>)}</ol></footer>
    </div>
  </>;
}

function FloatingMouths({ angle, onProgress }: { angle: React.RefObject<number>; onProgress: (progress: number) => void }) {
  const progress = useRef([0, 0, 0, 0]);
  const callbacks = useMemo(() => progress.current.map((_, index) => (value: number) => {
    progress.current[index] = Math.max(progress.current[index], value);
    onProgress(progress.current.reduce((sum, n) => sum + n, 0) / 4);
  }), [onProgress]);
  return <div className="floating-mouths" aria-hidden="true">{callbacks.map((onReady, index) => <div key={index} className={`floating-mouth mouth-${index + 1}`}><div className="floating-mouth-drift"><Planet angle={angle} onProgress={onReady}/></div></div>)}</div>;
}

function LiveMeeting({ prompt, openingQuestion, retry, onFinish, onExit, onVisual }: { prompt: string; openingQuestion?: string; retry: boolean; onFinish: (take: ConversationTake) => void; onExit: () => void; onVisual: (visual: Visual) => void }) {
  const call = useConversation({ prompt, focus: "language", scenario: "rehearsal", retry, openingQuestion });
  const [finishing, setFinishing] = useState(false);
  const ending = useRef(false), mounted = useRef(true);
  const latestFinish = useRef(onFinish); latestFinish.current = onFinish;
  const latest = call.transcript.at(-1);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onVisual({ state: call.muted && call.status === "listening" ? "idle" : call.status, mic: call.analyser.current, agent: call.agentAnalyser.current, demo: false }); });
  const end = useCallback(async () => {
    if (ending.current) return;
    ending.current = true; setFinishing(true);
    const take = await call.finish();
    if (mounted.current) latestFinish.current(take);
  }, [call.finish]);
  useEffect(() => { if (call.status === "ended") void end(); }, [call.status, end]);
  const failed = call.status === "error";
  const connected = ["listening", "thinking", "speaking"].includes(call.status);
  const alexState = !finishing && ["listening", "thinking", "speaking"].includes(call.status) ? call.status as "listening" | "thinking" | "speaking" : "idle";
  const microphoneOn = !finishing && !call.muted && ["waiting", "listening", "thinking", "speaking", "reconnecting"].includes(call.status);
  return <section className="rehearsal-live"><div ref={call.audioRoot} hidden/><div className="live-meta"><span>{retry ? "SECOND TAKE" : "YOUR CONVERSATION"}</span><span className={`live-microphone ${microphoneOn ? "is-on" : ""}`} role="status"><i/>{microphoneOn ? "Microphone on" : "Microphone off"}</span><span>{formatTime(call.seconds)} / {formatTime(call.duration)}</span></div><h1 className="sr-only" tabIndex={-1}>{retry ? "Try your answer again" : "Your practice conversation"}</h1>{!failed && <p className="live-status" role="status"><i/>{finishing ? "Finishing your transcript · microphone is off" : call.muted && connected ? "Microphone muted" : labels[call.status]}</p>}<div className="live-companion"><AlexAvatar state={alexState} analyser={call.agentAnalyser}/></div><div className="live-caption" aria-live="off">{!call.microphoneIssue && call.status !== "requesting" && <span>{latest?.speaker === "You" ? "YOU" : "ALEX / AI CONVERSATION PARTNER"}</span>}<p>{latest?.text || (call.microphoneIssue ? "Let’s get your microphone ready." : call.status === "requesting" ? "Allow your microphone to begin." : failed ? "We’ll start when you’re ready." : "A moment to settle in.")}</p></div>{!retry && !failed && !finishing && call.status !== "finishing" && call.seconds >= call.duration - 60 && <p className="session-wrap-up" role="status">About a minute left. Finish your thought—then we’ll look back at your conversation.</p>}{call.error && <p className="rehearsal-error" role="alert">{call.error}</p>}{call.transcriptWarning && <p role="status" className="rehearsal-fineprint">{call.transcriptWarning}</p>}{call.audioBlocked && !failed && <Button variant="primary" onClick={call.enableAudio}>Enable sound</Button>}<div className="rehearsal-actions live-actions">{failed ? <><Button variant="primary" loading={call.checkingMic} onClick={() => { ending.current = false; setFinishing(false); call.retry(); }}>{call.checkingMic ? "Checking microphone…" : call.microphoneIssue ? "Try microphone again" : "Reconnect"}</Button>{call.transcript.some(t => t.speaker === "You" && t.final) && <Button variant="secondary" onClick={end}>Review what I said</Button>}</> : <><Button variant="secondary" onClick={call.toggleMic} disabled={!connected || finishing || call.changingMic} aria-label={call.muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={call.muted}><Icon name="mic" size={20}/>{call.muted ? "Unmute" : "Mute"}</Button><Button variant="primary" onClick={end} disabled={!connected || finishing}>{finishing ? "Finishing…" : "Finish & reflect"}<Icon name="arrow" size={18}/></Button></>}</div>{call.microphoneIssue === "permission" && <MicrophoneHelp permission={call.microphonePermission}/>}<Button variant="ghost" className="exit-meeting" onClick={onExit}>{failed ? "Back to the brief" : "Leave rehearsal"}</Button><details className="live-history"><summary>Conversation so far</summary><div role="log" aria-live="off">{call.transcript.map(t => <p key={t.id}><strong>{t.speaker === "Fluent" ? "Alex" : "You"}</strong> {t.text}</p>)}</div></details><p className="rehearsal-fineprint">Take your time. You can finish whenever you’re ready.</p></section>;
}

function DemoMeeting({ retry, onFinish, onExit, onVisual }: { retry: boolean; onFinish: () => void; onExit: () => void; onVisual: (visual: Visual) => void }) {
  const [beat, setBeat] = useState(0);
  const turns = demoTurns[retry ? 1 : 0];
  useEffect(() => { const timer = setInterval(() => setBeat(n => Math.min(turns.length - 1, n + 1)), 4200); return () => clearInterval(timer); }, [turns]);
  useEffect(() => { onVisual({ state: turns[beat].speaker === "You" ? "listening" : "speaking", mic: null, agent: null, demo: true }); }, [beat, turns, onVisual]);
  return <section className="rehearsal-live"><div className="live-meta"><span>SCRIPTED DEMO</span><span className="live-microphone" role="status"><i/>Microphone off</span><span>{retry ? "SECOND TAKE" : "FIRST TAKE"}</span></div><h1 className="sr-only" tabIndex={-1}>Example meeting rehearsal</h1><p className="live-status"><i/>{turns[beat].speaker === "You" ? "An example answer" : "Alex’s question"}</p><div className="live-companion"><AlexAvatar state={turns[beat].speaker === "You" ? "listening" : "speaking"}/></div><div className="live-caption"><span>{turns[beat].speaker === "You" ? "YOU / SAMPLE ANSWER" : "ALEX / AI CONVERSATION PARTNER"}</span><p key={beat}>{turns[beat].text}</p></div><div className="rehearsal-actions live-actions"><Button variant="primary" onClick={onFinish}>See sample feedback <Icon name="arrow" size={17}/></Button></div><Button variant="ghost" className="exit-meeting" onClick={onExit}>Back to the brief</Button><p className="rehearsal-fineprint">A text preview of the experience. Live mode uses a real voice conversation.</p></section>;
}

function TakeAudio({ take, label }: { take?: Take; label: string }) {
  if (!take?.url) return null;
  return <div className="rehearsal-player"><span>{label}</span><audio controls preload="metadata" src={take.url} aria-label={label}/></div>;
}
function Transcript({ turns }: { turns: MeetingTurn[] }) {
  return <details className="rehearsal-transcript"><summary>Check the transcript</summary><p className="rehearsal-fineprint">Automatic transcription can mishear words. Feedback describes the transcript.</p>{turns.length ? turns.map((turn, i) => <p key={i}><strong>{turn.speaker === "Fluent" ? "Alex" : "You"}</strong>{turn.text}</p>) : <p>No complete transcript was received.</p>}</details>;
}

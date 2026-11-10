"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { focuses, formatTime, modes, prompts, sampleFeedback, type Focus, type Mode, type Screen } from "../lib/practice";
import { Button } from "./ui/button";
import { Icon } from "./icons";
import { useRecorder } from "./use-recorder";
import { Waveform } from "./waveform";
import { SpaceHome } from "./space-home";
import { Starfield } from "./starfield";
import { Conversation } from "./conversation";
import { PageLoader } from "./page-loader";
import { SpeakingPractice } from "./speaking-practice";

type Take = { url: string | null; seconds: number };

export function Studio() {
  const [cloudProgress, setCloudProgress] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [pageReady, setPageReady] = useState(false);
  const updateCloudProgress = useCallback((progress: number) => setCloudProgress((previous) => Math.max(previous, progress)), []);
  const revealPage = useCallback(() => setPageReady(true), []);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<Mode>("free");
  const [focus, setFocus] = useState<Focus>("both");
  const [promptIndex, setPromptIndex] = useState(0);
  const [customText, setCustomText] = useState("");
  const [ownText, setOwnText] = useState(false);
  const [demo, setDemo] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [retry, setRetry] = useState(false);
  const [takes, setTakes] = useState<Take[]>([]);
  const [hint, setHint] = useState(false);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const audio = useRecorder();
  const selected = modes.find((item) => item.id === mode)!;
  const prompt = ownText && customText.trim() ? customText.trim() : prompts[mode][promptIndex];
  const feedback = sampleFeedback[focus];

  useEffect(() => {
    let active = true;
    const images = Array.from(document.images).map((image) => image.decode().catch(() => {}));
    void Promise.all([document.fonts.ready, ...images]).then(() => { if (active) setAssetsReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!pageReady) return;
    title.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, pageReady]);

  useEffect(() => {
    if (screen !== "practice" || mode === "chat" || (mode === "free" && !demo) || paused || saving) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [screen, mode, demo, paused, saving]);

  function choose(value: Mode) {
    setMode(value); setPromptIndex(0); setOwnText(false); setRetry(false); setTakes([]); setScreen("setup");
  }

  async function start(isDemo: boolean, isRetry = false) {
    if (audio.pending || saving) return;
    if (mode === "chat" || (mode === "free" && !isDemo)) { setDemo(false); setScreen("practice"); return; }
    if (!isDemo && !(await audio.start())) return;
    setDemo(isDemo); setRetry(isRetry); setPaused(false); setSeconds(0); setHint(false); setScreen("practice");
  }

  async function finish() {
    if (saving) return;
    setSaving(true);
    const url = demo ? null : await audio.finish();
    setTakes((previous) => retry ? [previous[0], { url, seconds }] : [{ url, seconds }]);
    setSaving(false); setMore(false); setScreen(retry ? "compare" : "feedback");
  }

  function home() {
    audio.cancel(); changeScreen("home"); setRetry(false); setTakes([]);
  }

  function changeScreen(next: Screen) {
    if (next === "about") audio.cancel();
    const transition = (document as Document & { startViewTransition?: (update: () => void) => void }).startViewTransition;
    if (!reducedMotion && transition) transition.call(document, () => setScreen(next));
    else setScreen(next);
  }

  function togglePause() {
    audio.pause(!paused); setPaused(!paused);
  }

  const stage = screen === "home" || screen === "setup" ? 0 : screen === "practice" ? 1 : 2;

  const isInfoPage = screen === "home" || screen === "about";

  return <><PageLoader progress={Math.floor(cloudProgress * .9) + (assetsReady ? 10 : 0)} revealed={pageReady} onComplete={revealPage}/>
    <div inert={!pageReady} aria-hidden={!pageReady} className={`studio cosmic-studio ${pageReady ? "page-ready" : "page-preparing"} ${isInfoPage ? "is-home" : "is-session"}`}>
    <Starfield still={reducedMotion || screen !== "home"}/>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <button className="wordmark" onClick={home} aria-label="Fluent home"><span className="brand-mark"><Image src="/brand/fluent-lips-mint.svg" alt="" width={60} height={60} sizes="(max-width: 680px) 48px, 60px" preload /></span>fluent<span className="brand-period">.</span></button>
      <div className="header-right"><Button variant="ghost" className="about-button" aria-current={screen === "about" ? "page" : undefined} onClick={() => changeScreen("about")}>About</Button></div>
    </header>

    <main id="main" className={`main-content screen-${screen}`}>
      {screen === "home" && <SpaceHome onChoose={choose} titleRef={title} reducedMotion={reducedMotion} onCloudProgress={updateCloudProgress}/>}

      {screen === "about" && <section className="about-page enter">
        <span className="eyebrow">ABOUT FLUENT</span>
        <h1 ref={title} tabIndex={-1}>A little room<br/>to <span className="accent">practice</span></h1>
        <div className="about-copy">
          <p>Pick a way to speak, choose a focus, and give it a try.<br/>There’s no score to chase.</p>
          <p>Speak freely lets you record, listen back, and request language feedback on your sentences and word choices. Read something still shows sample coaching. Have a conversation connects you to an AI practice partner.</p>
          <p>Recordings stay in this tab unless you choose to send a Speak freely take to LiveKit and its AI providers for feedback. Live conversations stream audio for transcription and spoken replies. Fluent does not save recordings or transcripts to an account.</p>
        </div>
        <Button variant="ghost" color="var(--brand-green)" className="about-back" onClick={home}><Icon name="back" size={17}/>Back to the studio</Button>
      </section>}

      {screen === "setup" && <section className="setup-content enter">
        <Button variant="ghost" className="back-button" onClick={home}><Icon name="back" size={19}/>All ways to practice</Button>
        <h1 ref={title} tabIndex={-1}>{mode === "free" ? <>Speak <span className="accent">freely</span></> : mode === "read" ? <>Read <span className="accent">something</span></> : <>Have a <span className="accent">conversation</span></>}</h1>
        <div className="setup-panel">
          <div className="prompt-header"><span className="eyebrow">{mode === "read" ? "YOUR WORDS TO READ" : mode === "chat" ? "A CONVERSATION STARTER" : "A LITTLE INSPIRATION"}</span><Button variant="ghost" onClick={() => { setOwnText(false); setPromptIndex((promptIndex + 1) % prompts[mode].length); }}><Icon name="refresh" size={17}/>Another idea</Button></div>
          {ownText ? <><label className="sr-only" htmlFor="custom-text">{mode === "read" ? "Your passage" : "Your topic"}</label><textarea id="custom-text" className="custom-text" value={customText} onChange={(event) => setCustomText(event.target.value)} maxLength={4000} placeholder={mode === "read" ? "Paste a passage, a poem, or a few lines…" : "What would you like to talk about?"}/></> : <p className={`prompt-text ${mode === "read" ? "reading-preview" : ""}`}>{prompt}</p>}
          <Button variant="ghost" className="own-words" onClick={() => setOwnText(!ownText)}>{ownText ? "Use a suggested idea" : mode === "read" ? "I’ll bring my own words" : "I have my own idea"}</Button>
        </div>
        <fieldset className="focus-field"><legend>What would you like to work on?</legend><div className="focus-options">{focuses.map((item) => <label className={`focus-option ${focus === item.id ? "selected" : ""}`} key={item.id}><input type="radio" name="focus" value={item.id} checked={focus === item.id} onChange={() => setFocus(item.id)}/><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="radio-plus" aria-hidden="true">+</span></label>)}</div></fieldset>
        <div className="setup-actions">
          <Button variant="primary" disabled={audio.pending || (ownText && !customText.trim())} onClick={() => start(false)}><Icon name={mode === "chat" ? "chat" : "mic"} size={21}/>{audio.pending ? "Connecting microphone…" : mode === "chat" ? "Start conversation" : "Start practice"}</Button>
          {mode !== "chat" && <Button variant="ghost" disabled={audio.pending || (ownText && !customText.trim())} onClick={() => start(true)}>Explore without a microphone</Button>}
        </div>
        <p className="privacy-note">{mode === "chat" ? "Starting a conversation streams your microphone audio through LiveKit and AI providers for transcription and spoken replies. Sessions last up to 10 minutes. Fluent does not save an audio recording." : mode === "free" ? "Record up to two minutes. Audio stays in this tab until you choose to send it to LiveKit for sentence and word-choice feedback. Delivery measurements are coming next." : "Audio stays in this tab. Feedback is a sample for now."}</p>
        {audio.error && <p className="error-message" role="alert">{audio.error}</p>}
      </section>}

      {screen === "practice" && mode === "chat" && <Conversation prompt={prompt} focus={focus} onBack={() => setScreen("setup")}/>}

      {screen === "practice" && mode === "free" && !demo && <SpeakingPractice prompt={prompt} focus={focus} onBack={() => setScreen("setup")} onDone={() => setScreen("done")}/>}

      {screen === "practice" && mode !== "chat" && (mode !== "free" || demo) && <section className="practice-content enter">
        <div className="session-meta"><span>{retry ? "ONE MORE TRY" : selected.title.toUpperCase()}</span><span className="session-time">{formatTime(seconds)}</span></div>
        <div className="practice-heading"><span className="eyebrow">{retry ? "A SMALL CHANGE TO TRY" : mode === "read" ? "TAKE THE WORDS AT YOUR OWN PACE" : "THE FLOOR IS YOURS"}</span>
          <h1 ref={title} tabIndex={-1} className={mode === "read" && !retry ? "reading-script" : ""}>{retry ? feedback.exercise : prompt}</h1>
        </div>
        <div className="voice-area"><Waveform active={!paused && !saving} demo={demo} analyser={audio.analyser}/><p className="listening-state" role="status">{saving ? "Saving your take…" : paused ? "Take a breath. We’ll wait." : demo ? "Demo session · microphone is off" : "Recording · take your time"}</p></div>
        {hint && <p className="hint-text">{mode === "read" ? "Read it once as if you’re telling a friend. Notice where you naturally pause." : "Start with where you were, what happened, and why it stayed with you."}</p>}
        <div className="practice-controls"><Button variant="secondary" onClick={togglePause} disabled={saving}><Icon name={paused ? "play" : "pause"} size={19}/>{paused ? "Continue" : "Pause"}</Button><Button variant="primary" onClick={finish} disabled={saving}><Icon name="stop" size={19}/>Finish{retry ? " retry" : ""}</Button></div>
        <div className="practice-extras"><Button variant="ghost" aria-expanded={hint} onClick={() => setHint(!hint)}>{hint ? "Hide hint" : "Need a little help?"}</Button><Button variant="ghost" size="sm" color="var(--muted)" onClick={() => { audio.cancel(); setScreen(retry ? "feedback" : "setup"); }}>Discard {demo ? "session" : "recording"}</Button></div>
      </section>}

      {screen === "feedback" && <section className="feedback-content enter">
        <span className="eyebrow">A MOMENT TO REFLECT</span>
        <h1 ref={title} tabIndex={-1}>Hear yourself.<br/><span className="accent">Try something new.</span></h1>
        <p className="intro">Small changes are a good place to start.</p>
        <TakePlayer take={takes[0]} label="Your first take" demo={demo}/>
        <div className="feedback-example"><div className="example-heading"><span className="sample-badge">Sample feedback</span><span className="muted">{focuses.find((item) => item.id === focus)?.title}</span></div><p className="sample-explanation">An example of the coaching you’ll see. Your recording hasn’t been analyzed.</p>
          <div className="feedback-tip"><span className="tip-icon">✳</span><div><span className="eyebrow">ONE THING TO TRY</span><h2>{feedback.title}</h2><p>{feedback.description}</p></div></div>
          {more && <div className="extra-feedback"><h3>A useful thing to listen for</h3><p>{feedback.strength}</p><p>Listen back and decide what feels natural to you. There’s more than one way to say it.</p></div>}
          <Button variant="ghost" aria-expanded={more} onClick={() => setMore(!more)}>{more ? "Show less" : "A little more guidance"}</Button>
        </div>
        <div className="feedback-actions"><Button variant="primary" disabled={audio.pending} onClick={() => start(demo, true)}><Icon name="refresh" size={20}/>{audio.pending ? "Connecting…" : "Try a small change"}</Button><Button variant="ghost" onClick={() => setScreen("done")}>Done for now</Button></div>
        {audio.error && <p role="alert" className="error-message">{audio.error}</p>}
      </section>}

      {screen === "compare" && <section className="compare-content enter"><span className="eyebrow">SAME WORDS. A FRESH TAKE.</span><h1 ref={title} tabIndex={-1}>What feels<br/><span className="accent">different?</span></h1><p className="intro">Listen to both. You get to decide what feels like you.</p><div className="take-comparison"><TakePlayer take={takes[0]} label="First take" demo={demo}/><TakePlayer take={takes[1]} label="Another way to say it" demo={demo}/></div><p className="comparison-prompt">Did your pauses, emphasis, or choice of words change?</p><div className="feedback-actions"><Button variant="primary" onClick={() => setScreen("done")}><Icon name="check" size={20}/>Finish practice</Button><Button variant="ghost" disabled={audio.pending} onClick={() => start(demo, true)}>{audio.pending ? "Connecting…" : "Try once more"}</Button></div>{audio.error && <p className="error-message" role="alert">{audio.error}</p>}</section>}

      {screen === "done" && <section className="done-content enter"><div className="done-mark"><Icon name="check" size={40}/></div><span className="eyebrow">THAT’S A LITTLE PRACTICE, DONE.</span><h1 ref={title} tabIndex={-1}>More comfortable.<br/><span className="accent">One try at a time.</span></h1><p className="intro">Come back with another story, or just another thought.</p><Button variant="primary" onClick={home}>Back to the studio</Button><p className="privacy-note">Recordings are temporary and disappear when you close this tab.</p></section>}
    </main>

    <footer className="site-footer"><span>Your voice. Your pace.</span>{isInfoPage ? <span>A practice space, not a test.</span> : <ol className="steps" aria-label="Practice progress">{["Choose", "Practice", "Reflect"].map((label, index) => <li key={label} className={stage === index ? "current" : ""} aria-current={stage === index ? "step" : undefined}><span>{stage > index ? "✓" : `0${index + 1}`}</span>{label}</li>)}</ol>}</footer>
  </div></>;
}

function TakePlayer({ take, label, demo }: { take?: Take; label: string; demo: boolean }) {
  return <div className="take-player"><div className="take-label"><span className="take-icon"><Icon name="free" size={22}/></span><strong>{label}</strong><span>{formatTime(take?.seconds ?? 0)}</span></div>{take?.url ? <audio aria-label={label} controls src={take.url} preload="metadata"/> : <p className="demo-audio-note">{demo ? "Demo take · no audio was recorded" : "No audio was captured. Try another take."}</p>}</div>;
}

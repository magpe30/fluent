"use client";

import { useEffect, useRef } from "react";
import { type ConversationOptions } from "../lib/livekit/contracts";
import { formatTime } from "../lib/practice";
import { useConversation } from "./use-conversation";
import { Button } from "./ui/button";
import { Icon } from "./icons";
import { MicrophoneHelp } from "./microphone-help";
import { Waveform } from "./waveform";

export function Conversation({ prompt, focus, onBack }: ConversationOptions & { onBack: () => void }) {
  const call = useConversation({ prompt, focus });
  const title = useRef<HTMLHeadingElement>(null);
  const transcriptBox = useRef<HTMLDivElement>(null);
  const ended = call.status === "ended";
  const failed = call.status === "error";
  const connected = ["listening", "thinking", "speaking", "waiting"].includes(call.status);
  const labels = {
    requesting: "Allow microphone access in your browser to begin…",
    connecting: "Connecting your microphone…", waiting: "Waiting for your conversation partner…",
    listening: "Listening · take your time", thinking: "Thinking…", speaking: "Fluent is speaking · you can interrupt",
    reconnecting: "Reconnecting…", ended: "Session ended · microphone is off", error: "Session stopped · microphone is off",
  };

  useEffect(() => { title.current?.focus(); }, []);
  useEffect(() => {
    const box = transcriptBox.current;
    if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 180) box.scrollTop = box.scrollHeight;
  }, [call.transcript]);

  return <section className="practice-content conversation-content enter">
    <div ref={call.audioRoot} hidden />
    <div className="session-meta"><span>{ended ? "A LITTLE PRACTICE, DONE" : "HAVE A CONVERSATION"}</span><span className="session-time">{formatTime(call.seconds)}</span></div>
    <div className="practice-heading"><span className="eyebrow">{ended ? "YOUR CONVERSATION" : "A LITTLE ROOM TO TALK"}</span>
      <h1 ref={title} tabIndex={-1}>{ended ? "One conversation. A little more ease." : prompt}</h1>
    </div>
    {!ended && !failed && <div className="voice-area"><Waveform active={connected && !call.muted} analyser={call.analyser}/></div>}
    <p className="listening-state" role="status">{call.muted && connected ? "Microphone muted · you can still listen" : labels[call.status]}</p>
    {call.error && <p className="error-message" role="alert">{call.error}</p>}
    {call.microphoneIssue === "permission" && <MicrophoneHelp permission={call.microphonePermission}/>}
    {call.audioBlocked && !ended && !failed && <Button variant="secondary" className="audio-unlock" onClick={call.enableAudio}>Enable sound</Button>}
    <div className="conversation-transcript" ref={transcriptBox} role="log" aria-label="Conversation transcript" aria-live="off" tabIndex={0}>
      {call.transcript.length ? call.transcript.map((line) => <p key={line.id} className={`transcript-line ${line.speaker === "You" ? "from-you" : ""}`}><strong>{line.speaker}</strong><span>{line.text}</span></p>) : <p className="transcript-empty">{ended || failed ? "No transcript was received." : "Your conversation will appear here as you speak."}</p>}
    </div>
    {call.transcriptWarning && <p className="privacy-note" role="status">{call.transcriptWarning}</p>}
    <div className="practice-controls">
      {ended || failed ? <><Button variant="primary" loading={call.checkingMic} onClick={call.retry}><Icon name="refresh" size={19}/>{call.checkingMic ? "Checking microphone…" : call.microphoneIssue ? "Try microphone again" : "Try another conversation"}</Button><Button variant="ghost" onClick={onBack}>Back to setup</Button></> : <>
        <Button variant="secondary" disabled={!connected || call.changingMic} onClick={call.toggleMic}><Icon name="mic" size={19}/>{call.muted ? "Unmute" : "Mute"}</Button>
        <Button variant="primary" onClick={call.finish}><Icon name="stop" size={19}/>{connected ? "Finish conversation" : "Cancel"}</Button>
      </>}
    </div>
    <p className="privacy-note conversation-note">{ended ? "This is a transcript, not a voice assessment. It isn’t saved to a Fluent account." : "Live audio is processed by LiveKit and AI providers. Sessions last up to 10 minutes."}</p>
  </section>;
}

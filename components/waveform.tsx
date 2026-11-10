"use client";

import { useEffect, useRef, type RefObject } from "react";

export function Waveform({ active = false, demo = false, analyser }: { active?: boolean; demo?: boolean; analyser?: RefObject<AnalyserNode | null> }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || demo || !analyser) return;
    let frame = 0;
    const values = new Uint8Array(128);
    const draw = () => {
      analyser.current?.getByteFrequencyData(values);
      container.current?.querySelectorAll<HTMLElement>("span").forEach((bar, index) => {
        bar.style.height = `${Math.max(5, values[index * 2] / 255 * 90)}px`;
      });
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [active, demo, analyser]);

  return <div className={`waveform ${active ? "is-active" : ""} ${demo ? "is-demo" : ""}`} aria-hidden="true" ref={container}>
    {Array.from({ length: 44 }, (_, index) => <span key={index} style={{ height: active && demo ? `${10 + (Math.sin(index * 1.7) + 1) * 25 + Math.sin(index * .4) * 12}px` : "5px", animationDelay: `${index * -0.13}s` }} />)}
  </div>;
}

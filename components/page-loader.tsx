"use client";

import { useEffect, useRef, useState } from "react";
import { Starfield } from "./starfield";

export function PageLoader({ progress, revealed, onComplete }: {
  progress: number;
  revealed: boolean;
  onComplete: () => void;
}) {
  const [displayed, setDisplayed] = useState(0);
  const current = useRef(0);
  const target = useRef(progress);
  target.current = progress;

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const animate = (now: number) => {
      // Smooth milestone changes without ever getting ahead of readiness.
      current.current = Math.min(target.current, current.current + Math.min(now - previous, 50) * .14);
      previous = now;
      setDisplayed(Math.floor(current.current));
      if (current.current < 100) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (displayed !== 100) return;
    const timer = setTimeout(onComplete, 140);
    return () => clearTimeout(timer);
  }, [displayed, onComplete]);

  return <div className={`page-loader ${revealed ? "is-complete" : ""}`} aria-hidden={revealed}>
    <Starfield still/>
    <div className="page-loader-content" role="progressbar" aria-label="Loading Fluent" aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayed}>
      <div className="page-loader-number" aria-hidden="true"><span>{displayed}</span><span className="page-loader-percent">%</span></div>
      <div className="page-loader-track" aria-hidden="true"><span style={{ transform: `scaleX(${displayed / 100})` }}/></div>
      <p aria-hidden="true">Loading your space</p>
    </div>
  </div>;
}

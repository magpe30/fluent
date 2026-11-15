"use client";

import { useEffect, useRef, type RefObject } from "react";
import styles from "./alex-avatar.module.css";

type AlexAvatarProps = {
  state?: "idle" | "listening" | "thinking" | "speaking";
  analyser?: RefObject<AnalyserNode | null>;
  size?: "sm" | "md";
};

/** Stylized AI character. Mouth motion follows audio energy, not phoneme lip-sync. */
export function AlexAvatar({ state = "idle", analyser, size = "md" }: AlexAvatarProps) {
  const root = useRef<HTMLDivElement>(null);
  const current = useRef({ state, analyser });
  const redraw = useRef<(() => void) | null>(null);
  useEffect(() => { current.current = { state, analyser }; redraw.current?.(); }, [state, analyser]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, visible = true, previous = 0, elapsed = 0, mouth = .3, tilt = -4;
    let samples = new Uint8Array(256);
    const draw = (now: number) => {
      frame = 0;
      if (document.hidden || !visible) return;
      if (previous && now - previous < 1000 / 30 && !motion.matches) {
        frame = requestAnimationFrame(draw); return;
      }
      elapsed += previous ? Math.min(now - previous, 100) / 1000 : 0;
      previous = now;
      const { state: expression, analyser: audioRef } = current.current;
      const speaking = expression === "speaking", audio = audioRef?.current;
      if (speaking && audio && !motion.matches) {
        if (samples.length !== audio.fftSize) samples = new Uint8Array(audio.fftSize);
        audio.getByteTimeDomainData(samples);
        const energy = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
        mouth += (Math.min(1, .15 + energy * 8) - mouth) * .3;
      } else mouth = motion.matches ? .5 : .5 + .3 * Math.sin(elapsed * 16);
      const cycle = elapsed % 18;
      const glance = (start: number, end: number) => cycle > start && cycle < end ? Math.sin((cycle-start)/(end-start)*Math.PI)**2 : 0;
      // Keep the original silhouette. Features move across it at different depths
      // instead of rotating the entire illustration like a flat card.
      const look = motion.matches ? 0 : -glance(4,8) + .85 * glance(12,16);
      const desiredTilt = expression === "thinking" ? -8 : expression === "listening" ? 5 : expression === "speaking" ? 0 : -4;
      tilt += (desiredTilt - tilt) * .12;
      const blinkTime = elapsed % 6.7;
      const blink = motion.matches ? 1 : 1 - .9 * Math.max(0, 1 - Math.abs(blinkTime-4.5)/.13);
      element.style.setProperty("--look", String(look));
      element.style.setProperty("--head-tilt", `${motion.matches ? -4 : tilt}deg`);
      element.style.setProperty("--blink", String(blink));
      element.style.setProperty("--mouth-open", String(mouth));
      if (!motion.matches) frame = requestAnimationFrame(draw);
    };
    const refresh = () => { cancelAnimationFrame(frame); previous = 0; frame = requestAnimationFrame(draw); };
    const resize = new ResizeObserver(refresh);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); });
    resize.observe(element); intersection.observe(element);
    document.addEventListener("visibilitychange", refresh);
    motion.addEventListener("change", refresh);
    redraw.current = refresh; refresh();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect();
      document.removeEventListener("visibilitychange", refresh); motion.removeEventListener("change", refresh);
      redraw.current = null;
    };
  }, []);

  return <div ref={root} className={styles.avatar} data-state={state} data-size={size} aria-hidden="true">
    <div className={styles.head}>
      <div className={styles.ears}><i/><i/></div>
      <div className={styles.face}>
        <div className={styles.hair}><i/><i/><i/></div>
        <div className={styles.features}>
          <div className={styles.eyes}><i/><i/></div>
          <div className={styles.glasses}><i/><i/></div>
          <div className={styles.nose}/>
          <div className={styles.cheeks}><i/><i/></div>
          <div className={styles.mouth}/>
        </div>
      </div>
    </div>
  </div>;
}

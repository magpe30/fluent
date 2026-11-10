"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { modes, type Mode } from "../lib/practice";
import { Icon } from "./icons";
import { Planet } from "./planet";
import { PracticeIllustration } from "./practice-illustration";

export function SpaceHome({ onChoose, titleRef, reducedMotion, onCloudProgress }: {
  onChoose: (mode: Mode) => void;
  titleRef: RefObject<HTMLHeadingElement | null>;
  reducedMotion: boolean;
  onCloudProgress: (progress: number) => void;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const angle = useRef(-.24);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const frozen = useRef(false);
  const isFrozen = hovered || focused || reducedMotion;
  useEffect(() => { frozen.current = isFrozen; }, [isFrozen]);

  useEffect(() => {
    const element = scene.current;
    if (!element) return;
    let height = element.clientHeight;
    let frame = 0, previous = 0, floatTime = 0;
    const place = () => {
      const floatY = Math.sin(floatTime * Math.PI * 2 / 9000) * Math.min(10, height * .025);
      element.style.setProperty("--float-y", `${floatY}px`);
      element.dataset.angle = angle.current.toFixed(4);
    };
    const observer = new ResizeObserver(() => { height = element.clientHeight; place(); });
    observer.observe(element);
    const animate = (now: number) => {
      const elapsed = previous ? Math.min(now - previous, 50) : 0; previous = now;
      if (!frozen.current && !document.hidden) {
        angle.current += elapsed * .000045;
        floatTime += elapsed;
      }
      place(); frame = requestAnimationFrame(animate);
    };
    place(); frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  return <section className="space-home">
    <div className="space-heading"><h1 ref={titleRef} tabIndex={-1}>Find your <span>voice</span></h1><p>Pick a way to practice. Make it yours.</p></div>
    <div className="orbit-scene" ref={scene} data-paused={isFrozen} aria-label="Choose a way to practice">
      <div className="cloud-stage" aria-hidden="true">
        <div className="planet-aura"/>
        <Planet angle={angle} onProgress={onCloudProgress}/>
      </div>
      <div className="practice-choices">
      {modes.map((item, index) => <button key={item.id} className={`orbit-card orbit-${item.id}`} aria-label={item.title} onClick={() => onChoose(item.id)} onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
        <span className="card-registration" aria-hidden="true"><i/><i/><i/><i/></span>
        <span className="practice-card-face">
          <span className="orbit-card-top"><span className="orbit-icon"><PracticeIllustration mode={item.id}/></span><span className="orbit-index">0{index + 1}</span></span>
          <span className="practice-card-title">{item.title}</span>
          <span className="practice-card-description">{index === 0 ? "A story. A joke. A thought." : index === 1 ? "Your words, brought to life." : "See where a chat takes you."}</span>
          <span className="orbit-card-action">Let’s try it <span className="card-arrow"><Icon name="arrow" size={17}/></span></span>
        </span>
      </button>)}
      </div>
    </div>
  </section>;
}

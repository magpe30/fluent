"use client";

import { useEffect, useRef } from "react";

export function Starfield({ still = false }: { still?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    let w = 0, h = 0, frame = 0, last = 0, clock = 0, nextMeteor = 7;
    let meteor: { x: number; y: number; age: number } | null = null;
    let seed = 9241;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const stars = Array.from({ length: 95 }, () => ({ x: random(), y: random(), r: .4 + random() * 1.1, opacity: .09 + random() * .24, phase: random() * 6.28 }));
    // A cached tile gives the background a fine photographic grain without
    // regenerating thousands of noise pixels on every animation frame.
    const grain = document.createElement("canvas");
    grain.width = 256; grain.height = 256;
    const grainContext = grain.getContext("2d")!;
    const pixels = grainContext.createImageData(256, 256);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = random() > .5 ? 255 : 0;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value;
      pixels.data[i + 3] = Math.floor((5 + random() * 17) * .67);
    }
    grainContext.putImageData(pixels, 0, 0);
    const grainPattern = ctx.createPattern(grain, "repeat")!;
    const resize = () => {
      w = innerWidth; h = innerHeight;
      const ratio = Math.min(devicePixelRatio, 1.5);
      element.width = w * ratio; element.height = h * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint();
    };
    function paint() {
      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = grainPattern; ctx!.fillRect(0, 0, w, h);
      stars.forEach(star => {
        ctx!.fillStyle = `rgba(239,230,255,${star.opacity * (.8 + .2 * Math.sin(clock * .6 + star.phase))})`;
        ctx!.beginPath(); ctx!.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2); ctx!.fill();
      });
      if (meteor) {
        const x = meteor.x + meteor.age * 440, y = meteor.y + meteor.age * 260;
        const fade = Math.sin(Math.min(meteor.age / 1.2, 1) * Math.PI);
        const gradient = ctx!.createLinearGradient(x - 130, y - 77, x, y);
        gradient.addColorStop(0, 'rgba(220,208,255,0)'); gradient.addColorStop(1, `rgba(242,236,255,${fade})`);
        ctx!.strokeStyle = gradient; ctx!.lineWidth = 1.5;
        ctx!.beginPath(); ctx!.moveTo(x - 130, y - 77); ctx!.lineTo(x, y); ctx!.stroke();
      }
    }
    const animate = (now: number) => {
      const delta = last ? Math.min((now - last) / 1000, .05) : 0; last = now;
      if (!document.hidden) {
        clock += delta;
        if (clock > nextMeteor && !meteor) { meteor = { x: w * (.1 + random() * .6), y: h * random() * .4, age: 0 }; nextMeteor = clock + 9 + random() * 9; }
        if (meteor) { meteor.age += delta; if (meteor.age > 1.2) meteor = null; }
        paint();
      }
      frame = requestAnimationFrame(animate);
    };
    resize(); window.addEventListener("resize", resize);
    if (!still) frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, [still]);
  return <canvas className="starfield" ref={canvas} aria-hidden="true"/>;
}

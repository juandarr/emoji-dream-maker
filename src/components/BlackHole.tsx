"use client";

import { useEffect, useId, useRef } from "react";
import type { CSSProperties } from "react";

// Fixed lens geometry; only the light flows. Rotating the whole silhouette
// would turn the edge-on accretion disk away from the viewer.
const strands = Array.from({ length: 24 }, (_, i) => {
  const radius = 55 + i * .86;
  const left = 160 - radius;
  const right = 160 + radius;
  const upperRadiusX = radius * 1.12;
  const upperRadiusY = radius * 1.08;
  const shoulderX = upperRadiusX * Math.sqrt(3) / 2;
  const shoulderY = 120 - upperRadiusY / 2;
  // A round 120-degree arc with tangent-matched wings keeps the crown curved
  // and lets its shoulders spread smoothly into the edge-on disk.
  const wingX = upperRadiusX * .22;
  const wingY = upperRadiusY * .22 * Math.sqrt(3);
  return {
    top: `M 9 125 C 61 125 ${160 - shoulderX - wingX} ${shoulderY + wingY} ${160 - shoulderX} ${shoulderY} A ${upperRadiusX} ${upperRadiusY} 0 0 1 ${160 + shoulderX} ${shoulderY} C ${160 + shoulderX + wingX} ${shoulderY + wingY} 259 125 311 125`,
    bottom: `M ${left} 131 C ${left + 2} ${131 + radius * 1.27} ${right - 2} ${131 + radius * 1.27} ${right} 131`,
    color: i < 7 ? "#ffc06b" : i < 15 ? "#ff8c2b" : "#e04415",
    opacity: .8 - i * .022,
    style: { "--flow-period": `${13 + i * .61}s`, "--flow-delay": `${-((i * 37 + 13) % 97) / 97 * (13 + i * .61)}s` } as CSSProperties,
  };
});
const diskStrands = Array.from({ length: 16 }, (_, i) => ({
  rx: 75 + i * 4.6,
  ry: 3.8 + i * .67,
  style: { "--flow-period": `${10 + i * .7}s`, "--flow-delay": `${-((i * 61 + 29) % 101) / 101 * (10 + i * .7)}s` } as CSSProperties,
}));

type BlackHoleProps = { proximity: number; reduced: boolean; paused: boolean };

export default function BlackHole({ proximity, reduced, paused }: BlackHoleProps) {
  const id = useId().replaceAll(":", "");
  const svg = useRef<SVGSVGElement>(null);
  const speed = useRef(1);
  const ref = (name: string) => `url(#${id}-${name})`;

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    if (reduced) {
      speed.current = 1;
      element.style.setProperty("--accretion-energy", "0");
      return;
    }
    if (paused) return;
    const animations = element.getAnimations({ subtree: true });
    const target = 1 + proximity * 4.5;
    let frame = 0;
    let previous = performance.now();
    const settle = (now: number) => {
      const elapsed = Math.min(now - previous, 64);
      previous = now;
      speed.current += (target - speed.current) * (1 - Math.exp(-elapsed / 180));
      if (Math.abs(target - speed.current) < .005) speed.current = target;
      // Changing playback rate preserves the current phase, unlike changing
      // animation-duration, so approach and retreat never make the disk jump.
      for (const animation of animations) animation.updatePlaybackRate(speed.current);
      element.style.setProperty("--accretion-energy", String((speed.current - 1) / 4.5));
      if (speed.current !== target) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(frame);
  }, [proximity, reduced, paused]);

  return <svg ref={svg} className="black-hole" viewBox="0 0 320 240" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-halo`}>
        <stop offset=".25" stopColor="#ff922f" stopOpacity=".2"/>
        <stop offset=".6" stopColor="#c84b21" stopOpacity=".1"/>
        <stop offset="1" stopColor="#a63818" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id={`${id}-heat`} x1="0" x2="1">
        <stop stopColor="#bc3618" stopOpacity="0"/>
        <stop offset=".15" stopColor="#f26022"/>
        <stop offset=".37" stopColor="#ffe0a2"/>
        <stop offset=".55" stopColor="#ffb84e"/>
        <stop offset=".85" stopColor="#c44319"/>
        <stop offset="1" stopColor="#a52b13" stopOpacity="0"/>
      </linearGradient>
      <linearGradient id={`${id}-beaming`} x1="0" x2="1">
        <stop stopColor="#ffd78e"/>
        <stop offset=".36" stopColor="#ffb84e"/>
        <stop offset=".7" stopColor="#ff882e"/>
        <stop offset="1" stopColor="#d63f16"/>
      </linearGradient>
      <filter id={`${id}-glow`} x="-30%" y="-50%" width="160%" height="200%">
        <feGaussianBlur stdDeviation="3.5"/>
      </filter>
      <filter id={`${id}-bloom`} x="-20%" y="-40%" width="140%" height="180%">
        <feGaussianBlur stdDeviation=".75"/>
      </filter>
      <clipPath id={`${id}-foreground`}><rect x="0" y="125" width="320" height="40"/></clipPath>
    </defs>
    <ellipse className="black-hole-aura" cx="160" cy="121" rx="156" ry="109" fill={ref("halo")}/>
    <g className="black-hole-emission" fill="none" strokeLinecap="round">
      <g filter={ref("glow")} stroke={ref("heat")} strokeWidth="13" opacity=".6">
        <path d={strands[13].top}/><path d={strands[13].bottom}/>
        <ellipse cx="160" cy="125" rx="139" ry="13"/>
      </g>
      {/* Multiple fine, uneven filaments give the lensed disk depth. */}
      {strands.map((strand, i) => <g key={i} style={strand.style}>
        <path d={strand.top} stroke={strand.color} strokeWidth={i % 3 === 0 ? 1.5 : .75} opacity={strand.opacity}/>
        <path d={strand.bottom} stroke={strand.color} strokeWidth={i % 3 === 0 ? 1.4 : .7} opacity={strand.opacity * .72}/>
        {i % 2 === 0 && <g stroke={ref("beaming")} strokeWidth=".8" opacity=".65">
          <path className="black-hole-flow" d={strand.top} pathLength="1000" strokeDasharray="34 116 9 141 65 135 18 182 43 257"/>
          <path className="black-hole-flow black-hole-flow-reverse" d={strand.bottom} pathLength="1000" strokeDasharray="48 162 12 178 72 168 20 160 30 150"/>
        </g>}
      </g>)}
      <g stroke={ref("heat")}>
        {diskStrands.map((strand, i) => <ellipse key={i} cx="160" cy="125" rx={strand.rx} ry={strand.ry} strokeWidth="1" opacity={.7 - i * .026}/>)}
      </g>
    </g>
    {/* The shadow occludes the rear disk; the near disk passes in front. */}
    <circle cx="160" cy="120" r="50" fill="#030307"/>
    <circle cx="160" cy="120" r="50.5" fill="none" stroke="#fa9e42" strokeWidth=".7" opacity=".75"/>
    <circle cx="160" cy="120" r="52" fill="none" stroke="#ffad50" strokeWidth="1.4" opacity=".4" filter={ref("bloom")}/>
    <circle className="black-hole-flow black-hole-photon" cx="160" cy="120" r="50.8" fill="none" stroke="#ffe3ac" strokeWidth=".9" pathLength="1000" strokeDasharray="90 210 26 274 130 270" opacity=".65"/>
    <g className="black-hole-emission" fill="none" clipPath={ref("foreground")}>
      <ellipse cx="160" cy="125" rx="144" ry="12.5" stroke={ref("heat")} strokeWidth="7" opacity=".65" filter={ref("glow")}/>
      {diskStrands.map((strand, i) => <g key={i} style={strand.style}>
        <ellipse cx="160" cy="125" rx={strand.rx} ry={strand.ry} stroke={ref("heat")} strokeWidth={i % 3 === 0 ? 1.5 : .8} opacity=".85"/>
        <ellipse className="black-hole-flow" cx="160" cy="125" rx={strand.rx} ry={strand.ry} pathLength="1000" stroke={ref("beaming")} strokeWidth="1" strokeDasharray="55 95 15 185 90 110 25 175 45 205" opacity={i % 2 === 0 ? .85 : .45}/>
      </g>)}
    </g>
    <path d="M 13 125 Q 160 120 307 125" fill="none" stroke={ref("heat")} strokeWidth="1.6" filter={ref("bloom")}/>
  </svg>;
}

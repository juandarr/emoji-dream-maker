"use client";

import { useId } from "react";

// A small vector illustration: no video, image download, or rendering loop.
export default function BlackHole() {
  const id = useId().replaceAll(":", "");
  const ref = (name: string) => `url(#${id}-${name})`;
  return <svg className="black-hole" viewBox="0 0 320 240" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-halo`}>
        <stop offset="0" stopColor="#ffe6a5" stopOpacity=".28"/>
        <stop offset=".45" stopColor="#ec9c4b" stopOpacity=".16"/>
        <stop offset="1" stopColor="#b35a30" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id={`${id}-disk`} x1="0" x2="1">
        <stop stopColor="#b4652b" stopOpacity="0"/>
        <stop offset=".16" stopColor="#e8a75c"/>
        <stop offset=".43" stopColor="#fff5dc"/>
        <stop offset=".62" stopColor="#fffef2"/>
        <stop offset=".86" stopColor="#e4a057"/>
        <stop offset="1" stopColor="#b4652b" stopOpacity="0"/>
      </linearGradient>
      <linearGradient id={`${id}-lens`} x1="0" y1="1" x2="0" y2="0">
        <stop stopColor="#b96631" stopOpacity=".3"/>
        <stop offset=".55" stopColor="#ffd59a"/>
        <stop offset="1" stopColor="#fff6d8"/>
      </linearGradient>
      <filter id={`${id}-glow`} x="-60%" y="-90%" width="220%" height="280%">
        <feGaussianBlur stdDeviation="5"/>
      </filter>
      <filter id={`${id}-soft`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="1.2"/>
      </filter>
    </defs>
    <ellipse className="black-hole-aura" cx="160" cy="120" rx="153" ry="109" fill={ref("halo")}/>
    <g className="black-hole-light">
      <path d="M81 124 C82 25 238 25 239 124" fill="none" stroke={ref("lens")} strokeWidth="14" filter={ref("glow")}/>
      <path d="M83 124 C84 29 236 29 237 124" fill="none" stroke={ref("lens")} strokeWidth="5"/>
      <path d="M91 122 C94 39 226 39 229 122" fill="none" stroke="#fff0c6" strokeWidth="1" opacity=".7"/>
      <ellipse cx="160" cy="126" rx="136" ry="18" fill="none" stroke={ref("disk")} strokeWidth="10" filter={ref("glow")}/>
      <ellipse cx="160" cy="126" rx="130" ry="13" fill="none" stroke={ref("disk")} strokeWidth="4"/>
      <path d="M103 135 C110 203 210 203 217 135" fill="none" stroke={ref("lens")} strokeWidth="5" opacity=".45" filter={ref("soft")}/>
    </g>
    <circle cx="160" cy="120" r="54" fill="#030307"/>
    <circle cx="160" cy="120" r="55" fill="none" stroke="#ffda9b" strokeWidth="2" filter={ref("glow")}/>
    <circle cx="160" cy="120" r="54.5" fill="none" stroke="#ffe4b1" strokeWidth="1.1" opacity=".9"/>
    <g className="black-hole-light">
      <path d="M21 128 Q160 113 299 128 Q160 145 21 128" fill={ref("disk")} filter={ref("glow")}/>
      <path d="M24 127 Q160 118 296 127 Q160 134 24 127" fill={ref("disk")}/>
      <path d="M27 127 Q160 120 293 127" fill="none" stroke="#fffce5" strokeWidth="1.5"/>
      <path className="black-hole-stream" d="M36 128 Q160 137 284 128" fill="none" stroke="#fff6d6" strokeWidth="1.2" strokeDasharray="26 16 4 38" opacity=".7"/>
    </g>
  </svg>;
}

"use client";

import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { useDndMonitor } from "@dnd-kit/core";
import type { DragMoveEvent, DragStartEvent } from "@dnd-kit/core";

export type Gravity = {
  active: boolean;
  proximity: number;
  strength: number;
  heat: number;
  angle: number;
  x: number;
  y: number;
  glyph: string;
};
const resting: Gravity = { active: false, proximity: 0, strength: 0, heat: 0, angle: -Math.PI / 2, x: 0, y: 0, glyph: "" };
const GravityContext = createContext<{ field: Gravity; portal: MutableRefObject<HTMLElement | null> } | null>(null);
const smoothstep = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function useGravity() {
  const context = useContext(GravityContext);
  if (!context) throw new Error("Gravity visuals must be inside GravityField");
  return context;
}

// Keep pointer geometry separate from the measured droppable and drag overlay.
// Only the artwork deforms; the original grab point and drop target stay stable.
export function GravityField({ children, glyph, reduced, paused }: { children: ReactNode; glyph: string; reduced: boolean; paused: boolean }) {
  const portal = useRef<HTMLElement | null>(null);
  const target = useRef(resting);
  const current = useRef(resting);
  const frame = useRef(0);
  const [field, setField] = useState(resting);
  const lastGlyph = useRef(glyph);
  if (glyph) lastGlyph.current = glyph;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const motion = useRef({ at: 0, x: 0, y: 0, vx: 0, vy: 0, energy: 0 });

  const animate = () => {
    if (frame.current) return;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 64);
      motion.current.energy *= Math.exp(-elapsed / 650);
      if (motion.current.energy < .001) motion.current.energy = 0;
      const next = { ...target.current, heat: target.current.active ? smoothstep(motion.current.energy) : 0 };
      const old = current.current;
      const blend = 1 - Math.exp(-elapsed / 85);
      previous = now;
      const angleDelta = Math.atan2(Math.sin(next.angle - old.angle), Math.cos(next.angle - old.angle));
      const lerp = (from: number, to: number) => Math.abs(to - from) < .001 ? to : from + (to - from) * blend;
      const updated = {
        ...next,
        angle: old.angle + angleDelta * blend,
        x: lerp(old.x, next.x), y: lerp(old.y, next.y),
        proximity: lerp(old.proximity, next.proximity),
        strength: reducedRef.current ? 0 : lerp(old.strength, next.strength),
        heat: reducedRef.current ? 0 : lerp(old.heat, next.heat),
      };
      current.current = updated;
      setField(updated);
      const unsettled = Math.abs(angleDelta) > .001 || updated.proximity !== next.proximity ||
        (!reducedRef.current && (updated.strength !== next.strength || updated.heat !== next.heat || motion.current.energy > 0)) || updated.x !== next.x || updated.y !== next.y;
      frame.current = unsettled ? requestAnimationFrame(tick) : 0;
    };
    frame.current = requestAnimationFrame(tick);
  };
  const approach = ({ active }: DragMoveEvent | DragStartEvent) => {
    const emoji = active.rect.current.translated || active.rect.current.initial;
    const rect = portal.current?.getBoundingClientRect();
    if (!emoji || !rect) return;
    const x = (emoji.left + emoji.width / 2 - rect.left - rect.width / 2) / rect.width;
    const y = (emoji.top + emoji.height / 2 - rect.top - rect.height / 2) / rect.width;
    const distance = Math.hypot(x, y);
    const proximity = smoothstep(1 - distance / 1.7);
    const strength = Math.pow(proximity, 1.5);
    const now = performance.now();
    const last = motion.current;
    const elapsed = Math.max((now - last.at) / 1000, .016);
    const vx = (x - last.x) / elapsed, vy = (y - last.y) / elapsed;
    const speed = Math.hypot(vx, vy);
    const reversing = vx * last.vx + vy * last.vy < -1;
    // Repeated quick movements build heat; a single approach stays mostly warm.
    const charge = last.at && elapsed < .25 ? (Math.max(0, speed - 1.3) * Math.min(elapsed, .08) * .4 + (reversing && speed > 1.5 ? .28 : 0)) * strength : 0;
    motion.current = { at: now, x, y, vx, vy, energy: strength < .025 || reducedRef.current ? 0 : Math.min(1, last.energy + charge) };
    target.current = {
      active: true, glyph: "", x, y, heat: 0,
      // Retain direction at exact alignment, where atan2 would flip arbitrarily.
      angle: distance > .045 ? Math.atan2(y, x) : target.current.angle,
      proximity,
      strength,
    };
    animate();
  };
  const release = () => {
    motion.current = { at: 0, x: 0, y: 0, vx: 0, vy: 0, energy: 0 };
    target.current = { ...target.current, active: false, proximity: 0, strength: 0, heat: 0 };
    animate();
  };
  useDndMonitor({ onDragStart: approach, onDragMove: approach, onDragEnd: release, onDragCancel: release });
  useEffect(() => {
    if (paused) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      target.current = resting;
      current.current = resting;
      motion.current = { at: 0, x: 0, y: 0, vx: 0, vy: 0, energy: 0 };
      setField(resting);
    }
  }, [paused]);
  useEffect(() => () => { cancelAnimationFrame(frame.current); frame.current = 0; }, []);
  return <GravityContext.Provider value={{ field: { ...field, strength: reduced ? 0 : field.strength, heat: reduced ? 0 : field.heat, glyph: glyph || lastGlyph.current }, portal }}>{children}</GravityContext.Provider>;
}

const sliceCount = 28;
const sliceWidth = 96 / sliceCount;

// Bend narrow slices of the actual color glyph into a tangential arc. The
// inverse rotation keeps the emoji upright before the gravitational shear.
export function LensedGlyph({ glyph, strength, angle, prefix = "emoji" }: { glyph: string; strength: number; angle: number; prefix?: string }) {
  const id = `${prefix}-${useId().replaceAll(":", "")}`;
  const tangent = angle + Math.PI / 2;
  const nx = Math.cos(angle), ny = Math.sin(angle);
  const tx = -ny, ty = nx;
  const stretch = 1 + strength * 1.65;
  const compression = 1 - strength * .56;
  const bendRadius = 180 - strength * 115;
  return <g className="lensed-glyph" aria-hidden="true">
    <defs>
      <text id={`${id}-source`} x="0" y="1" textAnchor="middle" dominantBaseline="central" fontSize="64" fontFamily="'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif">{glyph}</text>
      {Array.from({ length: sliceCount }, (_, i) => <clipPath id={`${id}-slice-${i}`} key={i}>
        <rect x={-48 + i * sliceWidth - .15} y="-55" width={sliceWidth + .3} height="110"/>
      </clipPath>)}
    </defs>
    {Array.from({ length: sliceCount }, (_, i) => {
      const u = -48 + (i + .5) * sliceWidth;
      const theta = u * stretch * strength / bendRadius;
      const cos = Math.cos(theta), sin = Math.sin(theta);
      const a = (tx * cos - nx * sin) * stretch;
      const b = (ty * cos - ny * sin) * stretch;
      const c = -(nx * cos + tx * sin) * compression;
      const d = -(ny * cos + ty * sin) * compression;
      // Continuous as strength approaches zero (sin(theta) / strength).
      const arcX = strength > .001 ? bendRadius * (nx * (cos - 1) + tx * sin) / strength : tx * u * stretch;
      const arcY = strength > .001 ? bendRadius * (ny * (cos - 1) + ty * sin) / strength : ty * u * stretch;
      return <g key={i} transform={`matrix(${a} ${b} ${c} ${d} ${arcX - a * u} ${arcY - b * u})`}>
        <g clipPath={`url(#${id}-slice-${i})`}><use href={`#${id}-source`} transform={`rotate(${-tangent * 180 / Math.PI})`}/></g>
      </g>;
    })}
  </g>;
}

export function GravityEmoji({ glyph, label, size, reduced }: { glyph: string; label: string; size: number; reduced: boolean }) {
  const { field } = useGravity();
  const strength = reduced ? 0 : field.strength;
  return <span className={`drag-ghost ${strength > .025 ? "is-lensed" : ""}`} style={{ fontSize: size }} aria-label={label}>
    {strength <= .025 ? <span className="drag-emoji-original">{glyph}</span> :
      <svg className="drag-emoji-lens" width={size * 3} height={size * 3} viewBox="-96 -96 192 192" aria-hidden="true" focusable="false" style={{ filter: `drop-shadow(0 0 ${2 + strength * 6 + field.heat * 5}px rgba(${121 + field.heat * 134}, ${207 + field.heat * 48}, 255, ${.2 + strength * .35 + field.heat * .3}))` }}>
        <LensedGlyph glyph={glyph} strength={strength} angle={field.angle}/>
      </svg>}
  </span>;
}

export function GravityEcho({ field }: { field: Gravity }) {
  const id = useId().replaceAll(":", "");
  const { strength, angle, glyph } = field;
  const degrees = angle * 180 / Math.PI;
  const arc = (radius: number, spread: number) => {
    const x = radius * Math.cos(spread), y = radius * Math.sin(spread);
    return `M ${x} ${-y} A ${radius} ${radius} 0 ${spread > Math.PI / 2 ? 1 : 0} 1 ${x} ${y}`;
  };
  // The two images widen into an Einstein ring as the source approaches alignment.
  const spread = .16 + strength * 1.36;
  const radius = 98 + (1 - strength) * 16;
  return <g className="gravity-echo" opacity={strength * .85} aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-cyan`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#1676ef" stopOpacity="0"/><stop offset=".22" stopColor="#218cff"/>
        <stop offset=".5" stopColor="#adf4ff"/><stop offset=".78" stopColor="#218cff"/>
        <stop offset="1" stopColor="#1676ef" stopOpacity="0"/>
      </linearGradient>
      <filter id={`${id}-bloom`} x="-70%" y="-70%" width="240%" height="240%"><feGaussianBlur stdDeviation="2.4"/></filter>
      <filter id={`${id}-blue`} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 0 .18  0 0 0 0 .62  0 0 0 0 1  0 0 0 1 0"/>
      </filter>
    </defs>
    <g transform={`translate(160 120) rotate(${degrees})`} fill="none" stroke={`url(#${id}-cyan)`} strokeLinecap="round">
      {[0, 180].map((rotation, side) => <g key={rotation} transform={`rotate(${rotation})`} opacity={side ? .46 : 1}>
        <path d={arc(radius, spread)} strokeWidth={5 + strength * 6} opacity=".6" filter={`url(#${id}-bloom)`}/>
        {Array.from({ length: 7 }, (_, i) => <path key={i} className="gravity-caustic" d={arc(radius + (i - 3) * 1.65, spread * (1 - i * .055))}
          strokeWidth={i === 3 ? 1.2 : .65} opacity={1 - Math.abs(i - 3) * .16}/>)}
      </g>)}
    </g>
    {glyph && strength > .1 && <g transform={`translate(${160 - Math.cos(angle) * radius} ${120 - Math.sin(angle) * radius}) scale(.42)`} opacity={strength * .4} filter={`url(#${id}-blue)`}>
      <LensedGlyph glyph={glyph} strength={strength} angle={angle + Math.PI} prefix="echo"/>
    </g>}
  </g>;
}

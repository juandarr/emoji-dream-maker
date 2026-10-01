"use client";

import { useState } from "react";
import { ImageOff, LoaderCircle } from "lucide-react";
import { messages } from "@/lib/i18n";
import type { Locale, MediaItem } from "@/lib/types";

export function imageURL(value?: string) {
  try { const url = new URL(value || ""); return url.protocol === "https:" ? url.href : undefined; } catch { return undefined; }
}
export function ArtworkImage({ item, locale, large = false }: { item: MediaItem; locale: Locale; large?: boolean }) {
  const t = messages[locale];
  const preview = imageURL(item.previewUrl);
  const full = imageURL(item.imageUrl) || preview;
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = large && !fallback ? full : preview;
  if (failed || !src) return <span className="art-image-error" role="status"><ImageOff size={24}/><span>{t.imageUnavailable}</span></span>;
  return <>
    {!loaded && <span className="art-image-loading" aria-hidden="true"><LoaderCircle size={22}/></span>}
    <img src={src} alt={item.title} loading={large ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)} onError={() => {
        if (large && !fallback && full !== preview && preview) { setFallback(true); setLoaded(false); }
        else setFailed(true);
      }}/>
  </>;
}

"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { messages } from "@/lib/i18n";
import type { Locale, MediaItem } from "@/lib/types";

export default function VideoPlayer({ item, locale, onClose }: { item: MediaItem; locale: Locale; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const t = messages[locale];
  const url = new URL(item.embedUrl!);
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("rel", "0");
  url.searchParams.set("hl", locale);

  useEffect(() => {
    const node = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    node.showModal();
    return () => { node.close(); previous?.focus({ preventScroll: true }); };
  }, []);

  return <dialog ref={dialog} className="video-dialog" aria-labelledby="video-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const elements = event.currentTarget.querySelectorAll<HTMLElement>("button, iframe, a[href]");
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="video-dialog-header">
      <div><span>{t.watchLearn}</span><h2 id="video-title">{item.title}</h2></div>
      <button className="icon-button" onClick={onClose} aria-label={t.closeVideo} autoFocus><X size={24}/></button>
    </header>
    <div className="video-dialog-screen"><iframe src={url.href} title={item.title}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>
    <footer className="video-dialog-footer"><span>{item.creator}</span><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{t.openYouTube}<ArrowUpRight size={14}/></a></footer>
  </dialog>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { ArtworkImage, imageURL } from "./ArtworkImage";
import { messages } from "@/lib/i18n";
import type { Locale, MediaItem } from "@/lib/types";

export default function ImageViewer({ items, initialIndex, locale, onClose }: { items: MediaItem[]; initialIndex: number; locale: Locale; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const t = messages[locale], item = items[index];
  function move(step: number) { setIndex(previous => (previous + step + items.length) % items.length); setZoomed(false); stage.current?.scrollTo(0, 0); }
  useEffect(() => {
    const node = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    node.showModal();
    return () => { node.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="image-dialog" aria-labelledby="image-viewer-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
      if (event.key !== "Tab") return;
      const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex='0']"));
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="image-dialog-header"><div><span>{t.artGallery} · {index + 1} / {items.length}</span><h2 id="image-viewer-title">{item.title}</h2></div>
      <button className="icon-button" onClick={onClose} aria-label={t.closeImage} autoFocus><X size={24}/></button>
    </header>
    <div ref={stage} className={`image-dialog-stage ${zoomed ? "zoomed" : ""}`} tabIndex={0} aria-label={t.imageCanvas}>
      <div className="image-canvas"><ArtworkImage key={item.id} item={item} locale={locale} large/></div>
    </div>
    <div className="image-toolbar"><button onClick={() => move(-1)} disabled={items.length < 2} aria-label={t.previousImage}><ChevronLeft size={18}/></button>
      <span aria-live="polite">{index + 1} / {items.length}</span>
      <button onClick={() => move(1)} disabled={items.length < 2} aria-label={t.nextImage}><ChevronRight size={18}/></button>
      <button className="image-zoom" onClick={() => { setZoomed(value => !value); stage.current?.scrollTo(0, 0); }} aria-pressed={zoomed}>
        {zoomed ? <ZoomOut size={16}/> : <ZoomIn size={16}/>}{zoomed ? t.fitImage : t.zoomImage}
      </button>
    </div>
    <footer className="image-dialog-footer"><div><p>{item.creator || t.unknownArtist}{item.date && ` · ${item.date}`}</p><span>{item.collection}{item.kind && ` · ${item.kind}`}</span>
      {item.matchedTerm && <span>{t.connectedThrough} <strong>{item.matchedTerm}</strong></span>}</div>
      <div className="image-source-links"><a href={imageURL(item.licenseUrl)} target="_blank" rel="noopener noreferrer">{item.license}</a><a href={imageURL(item.sourceUrl)} target="_blank" rel="noopener noreferrer">{t.visitMuseum}<ArrowUpRight size={14}/></a></div>
    </footer>
  </dialog>;
}

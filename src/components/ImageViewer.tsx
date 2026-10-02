"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { ArtworkImage, imageURL } from "./ArtworkImage";
import { messages } from "@/lib/i18n";
import type { Locale, MediaItem } from "@/lib/types";

const MAX_ZOOM = 4;

export default function ImageViewer({ items, initialIndex, locale, onClose }: { items: MediaItem[]; initialIndex: number; locale: Locale; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const zoomed = zoom > 1;
  const t = messages[locale], item = items[index];
  const changeZoom = useCallback((value: number, clientX?: number, clientY?: number) => {
    const node = stage.current;
    if (!node) return;
    const next = Math.min(MAX_ZOOM, Math.max(1, value));
    if (next === zoomRef.current) return;
    const bounds = node.getBoundingClientRect();
    const x = clientX === undefined ? node.clientWidth / 2 : clientX - bounds.left;
    const y = clientY === undefined ? node.clientHeight / 2 : clientY - bounds.top;
    const ratio = next / zoomRef.current;
    pendingScroll.current = next === 1 ? { left: 0, top: 0 } : {
      left: ((pendingScroll.current?.left ?? node.scrollLeft) + x) * ratio - x,
      top: ((pendingScroll.current?.top ?? node.scrollTop) + y) * ratio - y,
    };
    zoomRef.current = next;
    setZoom(next);
  }, []);
  useLayoutEffect(() => {
    const position = pendingScroll.current;
    if (position) stage.current?.scrollTo(position.left, position.top);
    pendingScroll.current = null;
  }, [zoom]);
  useEffect(() => {
    const node = stage.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (drag.current) return;
      // Normalize wheel lines/pages as well as pixel deltas from trackpads.
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
      changeZoom(zoomRef.current * Math.exp(-delta * 0.002), event.clientX, event.clientY);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [changeZoom]);
  function endDrag() {
    const pointerId = drag.current?.pointerId;
    drag.current = null;
    setDragging(false);
    if (pointerId !== undefined && stage.current?.hasPointerCapture(pointerId)) stage.current.releasePointerCapture(pointerId);
  }
  function move(step: number) {
    endDrag();
    setIndex(previous => (previous + step + items.length) % items.length);
    changeZoom(1);
    stage.current?.scrollTo(0, 0);
  }
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
    <div ref={stage} className={`image-dialog-stage ${zoomed ? "zoomed" : ""} ${dragging ? "dragging" : ""}`} tabIndex={0} aria-label={t.imageCanvas} aria-describedby="image-controls-hint"
      onDoubleClick={event => changeZoom(zoomRef.current === MAX_ZOOM ? 1 : MAX_ZOOM, event.clientX, event.clientY)}
      onDragStart={event => event.preventDefault()}
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || zoomRef.current <= 1) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
        setDragging(true);
      }}
      onPointerMove={event => {
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId) return;
        event.currentTarget.scrollTo(start.left - (event.clientX - start.x), start.top - (event.clientY - start.y));
      }}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
      <div className="image-canvas" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%`, padding: `calc(var(--image-padding) * ${zoom})` }}><ArtworkImage key={item.id} item={item} locale={locale} large/></div>
    </div>
    <div className="image-toolbar"><div className="image-toolbar-controls"><button onClick={() => move(-1)} disabled={items.length < 2} aria-label={t.previousImage}><ChevronLeft size={18}/></button>
      <span aria-live="polite">{index + 1} / {items.length}</span>
      <button onClick={() => move(1)} disabled={items.length < 2} aria-label={t.nextImage}><ChevronRight size={18}/></button>
      <button className="image-zoom" onClick={() => changeZoom(zoomed ? 1 : MAX_ZOOM)} aria-pressed={zoomed}>
        {zoomed ? <ZoomOut size={16}/> : <ZoomIn size={16}/>}{zoomed ? t.fitImage : t.zoomImage}
      </button>
      <span className="image-zoom-level">{Math.round(zoom * 100)}%</span></div>
      <p id="image-controls-hint" className="image-controls-hint">{t.imageControlsHint}</p>
    </div>
    <footer className="image-dialog-footer"><div><p>{item.creator || t.unknownArtist}{item.date && ` · ${item.date}`}</p><span>{item.collection}{item.kind && ` · ${item.kind}`}</span>
      {item.matchedTerm && <span>{t.connectedThrough} <strong>{item.matchedTerm}</strong></span>}</div>
      <div className="image-source-links"><a href={imageURL(item.licenseUrl)} target="_blank" rel="noopener noreferrer">{item.license}</a><a href={imageURL(item.sourceUrl)} target="_blank" rel="noopener noreferrer">{t.visitMuseum}<ArrowUpRight size={14}/></a></div>
    </footer>
  </dialog>;
}

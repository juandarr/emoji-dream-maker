"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { messages } from "@/lib/i18n";
import type { Locale, MediaItem } from "@/lib/types";
import { loadYouTubePlayer } from "@/lib/youtube-player";
import type { YouTubePlayer } from "@/lib/youtube-player";

export default function VideoPlayer({ item, locale, onClose }: { item: MediaItem; locale: Locale; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const pendingPlayback = useRef<boolean | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const t = messages[locale];
  const url = new URL(item.embedUrl!);
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("playsinline", "1");
  url.searchParams.set("rel", "0");
  url.searchParams.set("hl", locale);
  url.searchParams.set("enablejsapi", "1");
  if (origin) url.searchParams.set("origin", origin);
  const embedURL = origin ? url.href : undefined;

  useEffect(() => {
    const node = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    node.showModal();
    setOrigin(window.location.origin);
    return () => { node.close(); previous?.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    if (!embedURL) return;
    let cancelled = false;
    let instance: YouTubePlayer | undefined;
    // A shortcut can arrive between opening the dialog and initializing the
    // iframe. Preserve that intent until onReady consumes it.
    void loadYouTubePlayer().then(api => {
      if (cancelled || !iframe.current) return;
      instance = new api.Player(iframe.current, { events: {
        onReady: event => {
          if (cancelled) return;
          player.current = event.target;
          if (pendingPlayback.current !== null) {
            if (pendingPlayback.current) event.target.playVideo();
            else event.target.pauseVideo();
            pendingPlayback.current = null;
          }
        },
      } });
    }).catch(() => { /* The embed's own playback and keyboard controls remain available. */ });
    return () => {
      cancelled = true;
      player.current = null;
      instance?.destroy();
    };
  }, [embedURL]);

  function togglePlayback() {
    const current = player.current;
    if (!current) { pendingPlayback.current = !(pendingPlayback.current ?? true); return; }
    const state = current.getPlayerState();
    if (state === 1 || state === 3) current.pauseVideo();
    else current.playVideo();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (screen.current?.requestFullscreen) {
      // Keep focus in our screen so shortcuts still work in fullscreen.
      screen.current.focus({ preventScroll: true });
      void screen.current.requestFullscreen().catch(() => {});
    }
  }

  return <dialog ref={dialog} className="video-dialog" aria-labelledby="video-title" aria-describedby="video-controls-hint"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      const target = event.target as HTMLElement;
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !target.closest("input, textarea, select, [contenteditable='true']")) {
        if (event.code === "Space" || event.key === " ") {
          event.preventDefault();
          if (!event.repeat) togglePlayback();
          return;
        }
        if (event.key.toLowerCase() === "f") {
          event.preventDefault();
          if (!event.repeat) toggleFullscreen();
          return;
        }
      }
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
    <div ref={screen} className="video-dialog-screen" tabIndex={-1}><iframe ref={iframe} src={embedURL} title={item.title}
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/></div>
    <footer className="video-dialog-footer"><div><span>{item.creator}</span><p id="video-controls-hint">{t.videoControlsHint}</p></div><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{t.openYouTube}<ArrowUpRight size={14}/></a></footer>
  </dialog>;
}

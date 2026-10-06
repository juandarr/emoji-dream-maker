"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Maximize, X } from "lucide-react";
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
  // Fullscreen belongs to the complete embed, rather than YouTube's internal
  // video element, which can exclude its controls after they auto-hide.
  url.searchParams.set("fs", "0");
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
    const stage = screen.current!;
    let tabbing = false;
    let tabTimer: ReturnType<typeof setTimeout>;
    let focusTimer: ReturnType<typeof setTimeout>;
    const keydown = (event: KeyboardEvent) => {
      tabbing = event.key === "Tab";
      clearTimeout(tabTimer);
      tabTimer = setTimeout(() => { tabbing = false; }, 0);
    };
    const blur = () => {
      // Cross-origin iframe clicks blur our window; their key events never
      // bubble to the dialog. Keep pointer users' shortcuts on the wrapper,
      // but let Tab users enter YouTube's controls for keyboard accessibility.
      if (tabbing) return;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        if (document.activeElement === iframe.current && dialog.current?.open) stage.focus({ preventScroll: true });
      }, 0);
    };
    document.addEventListener("keydown", keydown, true);
    window.addEventListener("blur", blur);
    return () => {
      clearTimeout(tabTimer);
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", keydown, true);
      window.removeEventListener("blur", blur);
    };
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

  function seekBy(seconds: number) {
    const current = player.current;
    if (!current) return;
    const duration = current.getDuration();
    const time = Math.max(0, current.getCurrentTime() + seconds);
    current.seekTo(duration > 0 ? Math.min(duration, time) : time, true);
  }

  return <dialog ref={dialog} className="video-dialog" aria-labelledby="video-title" aria-describedby="video-controls-hint"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      const target = event.target as HTMLElement;
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !target.closest("input, textarea, select, [contenteditable='true']")) {
        const key = event.key.toLowerCase();
        if (event.code === "Space" || event.key === " " || key === "k") {
          if (key!=="k" && target.closest("button, a[href], summary")) return;
          event.preventDefault();
          if (!event.repeat) togglePlayback();
          return;
        }
        if (key === "f") {
          event.preventDefault();
          if (!event.repeat) toggleFullscreen();
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight" || key === "j" || key === "l") {
          event.preventDefault();
          seekBy(key === "j" ? -10 : key === "l" ? 10 : event.key === "ArrowLeft" ? -5 : 5);
          return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const current = player.current;
          if (current) current.setVolume(Math.max(0, Math.min(100, current.getVolume() + (event.key === "ArrowUp" ? 5 : -5))));
          return;
        }
        if (key === "m") {
          event.preventDefault();
          const current = player.current;
          if (current && !event.repeat) {
            if (current.isMuted()) current.unMute();
            else current.mute();
          }
          return;
        }
      }
      if (event.key !== "Tab") return;
      const elements = event.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]), iframe, a[href], [tabindex='0']");
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
    <div ref={screen} className="video-dialog-screen" tabIndex={0} role="region" aria-label={item.title}><iframe ref={iframe} src={embedURL} title={item.title}
      allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"/></div>
    <footer className="video-dialog-footer"><div><span>{item.creator}</span><p id="video-controls-hint">{t.videoControlsHint}</p></div><div className="video-dialog-actions"><button className="icon-button" onClick={toggleFullscreen} aria-label={t.fullscreenVideo} title={t.fullscreenVideo}><Maximize size={18}/></button><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{t.openYouTube}<ArrowUpRight size={14}/></a></div></footer>
  </dialog>;
}

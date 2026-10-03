"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Copy, Expand, Feather, Pencil, X } from "lucide-react";
import type { GenerationRun, OutputKind, ReasoningEffort } from "@/features/generation/model";
import type { Locale } from "@/lib/types";
import { playgroundLabels } from "./labels";

export const storyLabels = {
  en: { chapter: "THE STORY SO FAR", history: "Your story shelf", historyHint: "Little worlds worth returning to. Your last 10 creations, saved here.", emptyHistory: "Your first creation will find a home here.", blank: "Every story begins with a little wonder.", blankHint: "Arrange your symbols, give them meaning, and let your imagination turn the page.", output: "The next chapter", read: "Open reading view", close: "Close reading view", done: "Done editing", details: "Creation details", open: "Read creation", waiting: "A new world is taking shape…", failed: "An unfinished chapter", untitled: "Untitled creation" },
  es: { chapter: "LA HISTORIA HASTA AQUÍ", history: "Tu biblioteca de historias", historyHint: "Pequeños mundos para volver a visitar. Tus últimas 10 creaciones, guardadas aquí.", emptyHistory: "Tu primera creación encontrará su lugar aquí.", blank: "Toda historia empieza con un poco de asombro.", blankHint: "Organiza tus símbolos, dales significado y deja que tu imaginación pase la página.", output: "El próximo capítulo", read: "Abrir vista de lectura", close: "Cerrar vista de lectura", done: "Terminar de editar", details: "Detalles de la creación", open: "Leer creación", waiting: "Un nuevo mundo está tomando forma…", failed: "Un capítulo por terminar", untitled: "Creación sin título" },
};

function Ornament({ className }: { className: string }) {
  return <svg className={className} viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M8 112V8h104M15 91V15h76M9 9c27 9 44 24 47 46S43 91 31 84s-6-25 4-19 1 14-4 10M9 9c9 27 24 44 46 47s36-13 29-25-25-6-19 4 14 1 10-4"/>
      <path d="M20 107c-10-14 10-22 19-12s-3 20-8 11m76-86c-14-10-22 10-12 19s20-3 11-8M40 47c-15 4-20 19-16 28M47 40c4-15 19-20 28-16M46 87c12-8 22-6 24 2s-11 12-11 4M87 46c-8 12-6 22 2 24s12-11 4-11"/>
      <path fill="currentColor" stroke="none" d="M12 12c23 7 28 19 30 28-12-4-19-12-30-28Zm3 10c2 24 8 36 15 37 2-12-4-26-15-37Zm7-7c24 2 36 8 37 15-12 2-26-4-37-15ZM18 46c-6 15-2 20 4 21 3-8 0-13-4-21Zm28-28c15-6 20-2 21 4-8 3-13 0-21-4Z"/>
      <circle cx="15" cy="98" r="2" fill="currentColor"/><circle cx="98" cy="15" r="2" fill="currentColor"/>
    </g>
  </svg>;
}

export function StoryPage({ children }: { children: ReactNode }) {
  return <div className="pg-story-page"><Ornament className="pg-ornament top-left"/><Ornament className="pg-ornament top-right"/><Ornament className="pg-ornament bottom-left"/><Ornament className="pg-ornament bottom-right"/><div className="pg-story-inner">{children}</div></div>;
}

export function StoryContent({ run, locale, outputName, stale, onEdit, onCopy }: { run: GenerationRun; locale: Locale; outputName: string; stale: boolean; onEdit: (text: string) => void; onCopy: (text: string) => Promise<boolean> }) {
  const t = playgroundLabels[locale], s = storyLabels[locale];
  const [editing, setEditing] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const effortNames: Record<ReasoningEffort, string> = { default: t.reasoningDefault, low: t.reasoningLow, medium: t.reasoningMedium, high: t.reasoningHigh };
  return <>
    <StoryPage>
      <span className="pg-story-kicker">{outputName}</span>
      <span className="pg-story-flourish" aria-hidden="true">❦</span>
      <h3 className="pg-story-title">{run.board.title || outputName}</h3>
      <div className="pg-story-divider" aria-hidden="true"><span>✧</span></div>
      {run.result ? editing ? <label className="pg-story-editor">{t.outputEdit}<textarea autoFocus aria-label={t.outputEdit} maxLength={16000} value={run.result.text} onChange={e => onEdit(e.target.value)}/></label> : <div className="pg-story-prose" lang={run.settings.locale}>{run.result.text}</div> : <div className="pg-story-pending" role="status"><Feather size={30}/><p>{run.status === "running" ? s.waiting : s.failed}</p><small>{run.status === "running" ? t.generating : run.error || t.unknown}</small></div>}
      <span className="pg-story-end" aria-hidden="true">❧</span>
    </StoryPage>
    {stale && <p className="pg-stale pg-hint">{t.stale}</p>}
    {run.result && <div className="pg-story-actions"><button onClick={() => setEditing(!editing)}><Pencil size={14}/>{editing ? s.done : t.outputEdit}</button><button onClick={async () => setCopyStatus(await onCopy(run.result!.text) ? t.copied : t.copyFailed)}><Copy size={14}/>{t.copyOutput}</button></div>}
    {copyStatus && <p className="pg-story-copy-status" role="status">{copyStatus}</p>}
    <details className="pg-story-details"><summary>{s.details}</summary><p>{new Date(run.createdAt).toLocaleString(locale)} · {run.result?.model || run.settings.model}{run.settings.reasoningEffort ? ` · ${effortNames[run.settings.reasoningEffort]}` : ""}</p>{run.result?.usage && <p>{run.result.usage.promptTokens} input / {run.result.usage.completionTokens} output tokens{run.result.usage.cost !== undefined ? ` · $${run.result.usage.cost.toFixed(6)}` : ""}</p>}<h4>{t.snapshot}</h4><pre>{run.brief.interpretation}</pre></details>
  </>;
}

export function StoryShelf({ runs, locale, outputNames, onOpen }: { runs: GenerationRun[]; locale: Locale; outputNames: Record<OutputKind, string>; onOpen: (id: string) => void }) {
  const s = storyLabels[locale], t = playgroundLabels[locale];
  return <section className="pg-results" aria-label={s.history}><div className="pg-shelf-heading"><h2><BookOpen size={17}/>{s.history}</h2><span>{runs.length} / 10</span></div><p className="pg-hint">{s.historyHint}</p>{runs.length ? <div className="pg-result-list">{runs.map(run => <button className="pg-history-card" key={run.id} onClick={() => onOpen(run.id)} aria-label={`${s.open}: ${run.board.title || outputNames[run.settings.kind]}`}><span className="pg-history-meta">{outputNames[run.settings.kind]}<span>{new Date(run.createdAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}</span></span><span className="pg-history-title">{run.board.title || outputNames[run.settings.kind]}</span><span className="pg-history-excerpt">{run.result?.text || (run.status === "running" ? t.generating : run.error || t.unknown)}</span><span className="pg-history-footer"><span aria-hidden="true">{run.board.nodes.slice(0, 5).map(n => n.glyph).join(" ")}</span><span>{s.open} <span aria-hidden="true">↗</span></span></span></button>)}</div> : <div className="pg-shelf-empty"><Feather size={20}/><p>{s.emptyHistory}</p></div>}</section>;
}

export function StoryModal({ title, locale, onClose, children }: { title: string; locale: Locale; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; previousFocus?.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} className="pg-reader" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}><header className="pg-reader-header"><span><BookOpen size={16}/>{storyLabels[locale].history}</span><button autoFocus aria-label={storyLabels[locale].close} onClick={onClose}><X size={20}/></button></header>{children}</dialog>;
}

export function ReadingButton({ locale, onClick }: { locale: Locale; onClick: () => void }) {
  return <button className="pg-reading-button" aria-label={storyLabels[locale].read} title={storyLabels[locale].read} onClick={onClick}><Expand size={16}/></button>;
}

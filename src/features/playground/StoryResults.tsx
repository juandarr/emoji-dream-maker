"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronUp, Copy, Expand, Feather, Pencil, Trash2, X } from "lucide-react";
import { creationTitle, type GenerationRun, type OutputKind, type ReasoningEffort } from "@/features/generation/model";
import type { Locale } from "@/lib/types";
import { playgroundLabels } from "./labels";
import { nodeLabel } from "./localization";
import { generationErrorMessage } from "@/features/generation/messages";
import EmojiArtwork from "./emoji-artwork";
import type { BoardNode } from "./model";
import { SAVED_RUN_LIMIT } from "./storage";
import { storyBody, storyHeading } from "./story-fonts";

import { storyLabels } from "./story-labels";
export { storyLabels } from "./story-labels";

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

export function StorySymbols({ nodes, locale }: { nodes: BoardNode[]; locale: Locale }) {
  const symbols = [...new Map(nodes.map(node => [node.glyph, node])).values()];
  if (!symbols.length) return <span className="pg-story-flourish" aria-hidden="true">❦</span>;
  return <div className="pg-story-symbols" role="img" aria-label={`${locale === "es" ? "Símbolos del lienzo" : "Canvas symbols"}: ${symbols.map(node => nodeLabel(node,locale)).join(", ")}`}>
    <span className="pg-story-symbol-motif" aria-hidden="true">{symbols.slice(0, 5).map(node => <span key={node.id}><EmojiArtwork glyph={node.glyph}/></span>)}{symbols.length > 5 && <span className="pg-story-symbol-more">+{symbols.length - 5}</span>}</span>
  </div>;
}

export function StoryPage({ children }: { children: ReactNode }) {
  return <div className={`pg-story-page ${storyHeading.variable} ${storyBody.variable}`}>
    <svg className="pg-imagination-thread" viewBox="0 0 64 36" fill="none" aria-hidden="true"><path d="M2 18C12 18 12 5 24 5S38 31 50 31 56 18 64 18" stroke="currentColor" strokeWidth="1"/><circle cx="2" cy="18" r="2" fill="currentColor"/></svg>
    <Ornament className="pg-ornament top-left"/><Ornament className="pg-ornament top-right"/><Ornament className="pg-ornament bottom-left"/><Ornament className="pg-ornament bottom-right"/><div className="pg-story-inner">{children}</div>
  </div>;
}

export function StoryContent({ run, locale, outputName, stale, onEdit, onCopy }: { run: GenerationRun; locale: Locale; outputName: string; stale: boolean; onEdit: (text: string) => void; onCopy: (text: string) => Promise<boolean> }) {
  const t = playgroundLabels[locale], s = storyLabels[locale];
  const [editing, setEditing] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(()=>setCopyStatus(""),[locale]);
  const effortNames: Record<ReasoningEffort, string> = { default: t.reasoningDefault, low: t.reasoningLow, medium: t.reasoningMedium, high: t.reasoningHigh };
  return <>
    <StoryPage>
      <span className="pg-story-kicker">{outputName}</span>
      <StorySymbols nodes={run.board.nodes} locale={locale}/>
      <h3 className="pg-story-title" lang={run.settings.locale}>{creationTitle(run) || outputName}</h3>
      <div className="pg-story-divider" aria-hidden="true"><span>✧</span></div>
      {run.result ? editing ? <label className="pg-story-editor">{t.outputEdit}<textarea autoFocus lang={run.settings.locale} aria-label={t.outputEdit} maxLength={16000} value={run.result.text} onChange={e => onEdit(e.target.value)}/></label> : <div role="region" aria-label={outputName} tabIndex={0} className="pg-story-prose" lang={run.settings.locale}>{run.result.text}</div> : <div className="pg-story-pending" role="status"><Feather size={30}/><p>{run.status === "running" ? s.waiting : s.failed}</p><small>{run.status === "running" ? t.generating : generationErrorMessage(run,locale)}</small></div>}
      <span className="pg-story-end" aria-hidden="true">❧</span>
    </StoryPage>
    {stale && <p className="pg-stale pg-hint">{t.stale}</p>}
    {run.result && <div className="pg-story-actions"><button onClick={() => setEditing(!editing)}><Pencil size={14}/>{editing ? s.done : t.outputEdit}</button><button onClick={async () => setCopyStatus(await onCopy(run.result!.text) ? t.copied : t.copyFailed)}><Copy size={14}/>{t.copyOutput}</button></div>}
    {copyStatus && <p className="pg-story-copy-status" role="status">{copyStatus}</p>}
    <details className="pg-story-details"><summary>{s.details}</summary><p>{new Date(run.createdAt).toLocaleString(locale)} · {run.result?.model || run.settings.model}{run.settings.reasoningEffort ? ` · ${effortNames[run.settings.reasoningEffort]}` : ""}</p>{run.result?.usage && <p>{s.inputTokens}: {run.result.usage.promptTokens.toLocaleString(locale)} · {s.outputTokens}: {run.result.usage.completionTokens.toLocaleString(locale)}{run.result.usage.cost !== undefined ? ` · ${s.cost}: ${new Intl.NumberFormat(locale,{style:"currency",currency:"USD",minimumFractionDigits:6,maximumFractionDigits:6}).format(run.result.usage.cost)}` : ""}</p>}<h4>{t.snapshot}</h4><pre lang={run.settings.locale}>{run.brief.interpretation}</pre></details>
  </>;
}

export function StoryShelf({ runs, locale, outputNames, onOpen, onDelete, onUndo, deletedTitle }: { runs: GenerationRun[]; locale: Locale; outputNames: Record<OutputKind, string>; onOpen: (id: string) => void; onDelete:(id:string)=>void; onUndo:()=>void; deletedTitle?:string }) {
  const s = storyLabels[locale], t = playgroundLabels[locale];
  const h=locale==="es"?{remove:"Eliminar creación",all:"Mostrar todas",fewer:"Mostrar menos",deleted:"Creación eliminada",undo:"Deshacer"}:{remove:"Delete creation",all:"Show all",fewer:"Show fewer",deleted:"Creation deleted",undo:"Undo"};
  const [expanded,setExpanded]=useState(false);
  const shelfRef=useRef<HTMLElement>(null),deletedIndex=useRef<number|null>(null);
  const visible=expanded?runs:runs.slice(0,5);
  useEffect(()=>{
    if(deletedIndex.current===null)return;
    const controls=shelfRef.current?.querySelectorAll<HTMLButtonElement>(".pg-history-delete");
    const next=controls?.[Math.min(deletedIndex.current,controls.length-1)]??shelfRef.current?.querySelector<HTMLButtonElement>(".pg-history-undo");
    next?.focus({preventScroll:true});deletedIndex.current=null;
  },[runs]);
  return <section ref={shelfRef} className="pg-results" aria-label={s.history}>
    <div className="pg-shelf-heading"><h2><BookOpen size={17}/>{s.history}</h2><span>{runs.length} / {SAVED_RUN_LIMIT}</span></div><p className="pg-hint">{s.historyHint}</p>
    {runs.length ? <div id="pg-history-gallery" className="pg-result-list">{visible.map((run,index) => {
      const title=creationTitle(run)||outputNames[run.settings.kind];
      return <article className="pg-history-card" key={run.id}>
        <div className="pg-history-meta"><span>{outputNames[run.settings.kind]}</span><span className="pg-history-meta-actions"><time dateTime={new Date(run.createdAt).toISOString()}>{new Date(run.createdAt).toLocaleDateString(locale,{month:"short",day:"numeric"})}</time><button className="pg-history-delete" aria-label={`${h.remove}: ${title}`} title={h.remove} onClick={()=>{deletedIndex.current=index;onDelete(run.id);}}><Trash2 size={14}/></button></span></div>
        <button className="pg-history-read" onClick={()=>onOpen(run.id)} aria-label={`${s.open}: ${title}`}><span className="pg-history-title" lang={run.settings.locale}>{title}</span><span className="pg-history-excerpt" lang={run.result?run.settings.locale:locale}>{run.result?.text || (run.status === "running" ? t.generating : generationErrorMessage(run,locale))}</span><span className="pg-history-footer"><span aria-hidden="true">{run.board.nodes.slice(0,5).map(n=>n.glyph).join(" ")}</span><span>{s.open} <span aria-hidden="true">↗</span></span></span></button>
      </article>;
    })}</div> : <div className="pg-shelf-empty"><Feather size={20}/><p>{s.emptyHistory}</p></div>}
    {runs.length>5&&<div className="pg-history-expansion"><button aria-expanded={expanded} aria-controls="pg-history-gallery" onClick={()=>setExpanded(!expanded)}>{expanded?h.fewer:`${h.all} (${runs.length})`}{expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>}</button></div>}
    {deletedTitle&&<div className="pg-history-notice" role="status"><span>{h.deleted}<span className="pg-deleted-title"> · {deletedTitle}</span></span><button className="pg-history-undo" onClick={onUndo}>{h.undo}</button></div>}
  </section>;
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
  return <dialog ref={dialog} className="pg-reader" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onKeyDown={e => {
    if (e.key !== "Tab") return;
    const targets = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(element => element.getClientRects().length > 0);
    const first = targets[0], last = targets.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }} onClick={e => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}><header className="pg-reader-header"><span><BookOpen size={16}/>{storyLabels[locale].history}</span><button autoFocus aria-label={storyLabels[locale].close} onClick={onClose}><X size={20}/></button></header><div className="pg-reader-scroll">{children}</div></dialog>;
}

export function ReadingButton({ locale, onClick }: { locale: Locale; onClick: () => void }) {
  return <button className="pg-reading-button" aria-label={storyLabels[locale].read} title={storyLabels[locale].read} onClick={onClick}><Expand size={16}/></button>;
}

"use client";

import { useState } from "react";
import { ArrowUpRight, Maximize2, Palette, RefreshCw } from "lucide-react";
import ImageViewer from "./ImageViewer";
import { ArtworkImage, imageURL } from "./ArtworkImage";
import { messages } from "@/lib/i18n";
import type { Locale, ProviderResult } from "@/lib/types";

export default function ArtGallery({ result, locale, reduced, retry, onOpen }: { result: ProviderResult; locale: Locale; reduced: boolean; retry: () => void; onOpen: () => void }) {
  const t = messages[locale];
  const [selected, setSelected] = useState<number | null>(null);
  const items = result.items.slice(0, 5);
  const retrySource = () => { setSelected(null); retry(); };
  const failure = result.status === "empty" ? t.noArt : result.reason === "quota" ? t.quota : result.reason === "timeout" ? t.timeout : t.network;
  return <section className="media-section art-section" aria-label={t.artGallery} aria-busy={result.status === "loading"}>
    <div className="section-heading"><h3><Palette size={17}/>{t.artGallery}</h3><span className="art-open-access">{t.museumCollections}</span></div>
    <p className="art-section-hint">{t.artHint}</p>
    {result.partial && <div className="art-partial" role="status"><span>{t.artPartial}</span><button onClick={retrySource}>{t.retry}<RefreshCw size={12}/></button></div>}
    {result.status === "loading" ? <div className="art-skeletons" role="status" aria-label={t.loading}>
      {[0, 1, 2].map(index => <div className={`art-skeleton ${reduced ? "" : "shimmer"}`} key={index}><Palette size={24}/><span/><span/></div>)}
    </div> : result.status !== "ready" ? <div className="source-empty"><p>{failure}</p><button onClick={retrySource}>{t.retry}<RefreshCw size={13}/></button></div> : <>
      <div className="art-results-label"><span>{items.length.toLocaleString(locale)} {items.length===1?t.visualConnectionOne:t.visualConnections}</span><span>{t.clickToExplore}</span></div>
      <div className="art-grid">
        {items.map((item, index) => <article className="artwork-card" key={item.id}>
          <button className="artwork-preview" onClick={() => { onOpen(); setSelected(index); }} aria-label={`${t.expandImage}: ${item.title}`}>
            <ArtworkImage item={item} locale={locale}/>
            <span className="artwork-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <span className="artwork-expand"><Maximize2 size={14}/>{t.viewImage}</span>
          </button>
          <div className="artwork-caption">
            <span className="art-kind">{item.kind || t.art}</span><h4>{item.title}</h4>
            <p>{item.creator || t.unknownArtist}{item.date && ` · ${item.date}`}</p>
            {item.matchedTerm && <span className="art-match">{t.connectedThrough} <strong>{item.matchedTerm}</strong></span>}
            <div className="artwork-provenance"><span>{item.collection}</span><a href={imageURL(item.licenseUrl)} target="_blank" rel="noopener noreferrer">{item.license}</a></div>
            <a className="artwork-source" href={imageURL(item.sourceUrl)} target="_blank" rel="noopener noreferrer">{t.visitMuseum}<ArrowUpRight size={13}/></a>
          </div>
        </article>)}
      </div>
      {selected !== null && items[selected] && <ImageViewer items={items} initialIndex={selected} locale={locale} onClose={() => setSelected(null)}/>}
    </>}
  </section>;
}

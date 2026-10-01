"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, LoaderCircle, Search } from "lucide-react";
import { validTopic } from "@/lib/storage";
import type { Locale, ProviderResult, RelatedResult, TopicCandidate } from "@/lib/types";

const copy = {
  en:{heading:"UNDERSTAND & EXPLORE",summary:"Wikipedia · opening summary",english:"English context",read:"Read full article",revision:"Revision",related:"Keep exploring",loading:"Finding connections…",failed:"Connections couldn’t load. The article is still available.",none:"No additional connections found in this article.",retry:"Try again",change:"Choose a different concept",missing:"Let’s find the right idea",missingText:"Wikipedia doesn’t have a clear article under this name. Choose a broader concept or search Wikipedia directly.",offline:"The summary couldn’t load",offlineText:"Wikipedia is temporarily unreachable. You can open it directly, retry, or explore another concept. Other media sources still work.",search:"Search Wikipedia",loadingSummary:"Opening the Wikipedia summary…"},
  es:{heading:"COMPRENDER Y EXPLORAR",summary:"Wikipedia · resumen inicial",english:"Contexto en inglés",read:"Leer artículo completo",revision:"Revisión",related:"Sigue explorando",loading:"Buscando conexiones…",failed:"No pudimos cargar las conexiones. El artículo sigue disponible.",none:"No encontramos más conexiones en este artículo.",retry:"Intentar de nuevo",change:"Elegir otro concepto",missing:"Encontremos la idea adecuada",missingText:"Wikipedia no tiene un artículo claro con este nombre. Elige un concepto más amplio o busca directamente en Wikipedia.",offline:"No se pudo cargar el resumen",offlineText:"Wikipedia no está disponible temporalmente. Puedes abrirla directamente, reintentar o explorar otro concepto. Las demás fuentes siguen funcionando.",search:"Buscar en Wikipedia",loadingSummary:"Abriendo el resumen de Wikipedia…"},
};
const safe=(value?:string)=>{try{const url=new URL(value||"");return url.protocol==="https:"?url.href:undefined;}catch{return undefined;}};
export default function WikipediaContext({result,topic,emojiLabel,locale,retry,change,choose,reduced}:{result:ProviderResult;topic:TopicCandidate;emojiLabel:string;locale:Locale;retry:()=>void;change:()=>void;choose:(topic:TopicCandidate)=>void;reduced:boolean}) {
  const t=copy[locale];
  const [related,setRelated]=useState<RelatedResult|null>(null);
  const [remaining,setRemaining]=useState(0);
  useEffect(()=>{
    const until=Date.now()+(result.retryAfter||0)*1000;
    const tick=()=>setRemaining(Math.max(0,Math.ceil((until-Date.now())/1000)));tick();
    if(!result.retryAfter)return;const timer=setInterval(tick,1000);return ()=>clearInterval(timer);
  },[result]);
  const [attempt,setAttempt]=useState(0);
  const article=result.status==="ready"?result.items[0]:undefined;
  const title=article?.title,language=article?.language||topic.language;
  useEffect(()=>{
    setRelated(null);
    if(!title)return;
    const controller=new AbortController();
    fetch(`/api/related?title=${encodeURIComponent(title)}&locale=${language}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(6500)])})
      .then(async response=>{if(!response.ok)throw new Error();return await response.json() as RelatedResult;})
      .then(data=>{if(!controller.signal.aborted)setRelated({...data,topics:data.topics.filter(validTopic)});})
      .catch(()=>{if(!controller.signal.aborted)setRelated({status:"error",topics:[]});});
    return ()=>controller.abort();
  },[title,language,attempt]);
  const searchURL=`https://${topic.language}.wikipedia.org/w/index.php?search=${encodeURIComponent(topic.query)}`;
  return <section className="wikipedia-section knowledge-section" aria-label={t.heading} aria-busy={result.status==="loading"}>
    <div className="section-heading"><h3><BookOpen size={17}/>{t.heading}</h3></div>
    {emojiLabel.toLocaleLowerCase(locale)!==topic.label.toLocaleLowerCase(locale)&&<p className="concept-caption"><strong>{emojiLabel}</strong><ArrowRight size={12}/><strong>{topic.label}</strong></p>}
    {result.status==="loading"?<div className="loading-state"><LoaderCircle size={18} className={reduced?"":"spin"}/>{t.loadingSummary}<div className="skeleton-line"/><div className="skeleton-line short"/></div>:article?<>
      <article className="wiki-content">
        <div className="wiki-label"><span>{t.summary}</span>{language!==locale&&<span className="fallback-badge">{t.english}</span>}</div>
        <h4>{article.title}</h4><p>{article.excerpt}</p>
        <div className="wiki-actions"><a className="wiki-read" href={safe(article.sourceUrl)} target="_blank" rel="noopener noreferrer">{t.read}<ArrowUpRight size={15}/></a></div>
        <div className="attribution">{article.revisionUrl&&<a href={safe(article.revisionUrl)} target="_blank" rel="noopener noreferrer">{t.revision}</a>}{article.licenseUrl&&<a href={safe(article.licenseUrl)} target="_blank" rel="noopener noreferrer">{article.license}</a>}</div>
      </article>
      <div className="related-topics" aria-label={t.related}>
        <h4>{t.related}<span>↗</span></h4>
        {!related?<p className="related-status" role="status">{t.loading}</p>:related.status==="ready"?<div className="related-grid">{related.topics.map(next=><button key={`${next.language}:${next.wikiId||next.label}`} onClick={()=>choose(next)}><span><strong>{next.label}</strong>{next.description&&<small>{next.description}</small>}</span><ArrowRight size={16}/></button>)}</div>:<div className="related-status"><span>{related.status==="empty"?t.none:t.failed}</span>{related.status==="error"&&<button onClick={()=>setAttempt(a=>a+1)}>{t.retry}</button>}</div>}
      </div>
    </>:<div className="wiki-content wiki-unavailable"><h4>{result.status==="empty"?t.missing:t.offline}</h4><p>{result.status==="empty"?t.missingText:result.reason==="quota"?(locale==="es"?"Wikipedia ha pedido una pausa en las consultas. Puedes leer en su sitio o reintentar después de la espera.":"Wikipedia has asked the app to pause requests. You can read on its website or retry after the wait."):t.offlineText}</p><div className="wiki-actions"><button onClick={change}><Search size={14}/>{t.change}</button><a href={searchURL} target="_blank" rel="noopener noreferrer">{t.search}<ArrowUpRight size={14}/></a>{result.status!=="empty"&&<button onClick={retry} disabled={remaining>0}>{remaining>0?`${t.retry} · ${remaining}s`:t.retry}</button>}</div></div>}
  </section>;
}

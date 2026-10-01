"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, BookOpen, Check, ChevronRight, Heart, LoaderCircle, Music2, Palette, Play, Search, Sparkles, X } from "lucide-react";
import WikipediaContext from "./WikipediaContext";
import VideoPlayer from "./VideoPlayer";
import { defaultTopic } from "@/lib/catalog";
import { messages } from "@/lib/i18n";
import { searchGiphy } from "@/lib/giphy";
import { validTopic } from "@/lib/storage";
import type { Discovery, EmojiRecord, Locale, MediaItem, Provider, ProviderResult, Resolution, TopicCandidate } from "@/lib/types";

const providers: Provider[]=["wikipedia","youtube","giphy","freesound","art"];
const loading: ProviderResult={status:"loading",items:[]};
function emptyResults() { return Object.fromEntries(providers.map(p=>[p,loading])) as Record<Provider,ProviderResult>; }
const safeURL=(url?:string)=>{try { const parsed=new URL(url||""); return parsed.protocol==="https:"?parsed.href:undefined; }catch{return undefined;}};

function Preview({item,className=""}:{item:MediaItem;className?:string}) {
  const [failed,setFailed]=useState(false);
  if(failed||!safeURL(item.previewUrl)) return <div className={`preview-fallback ${className}`}><Sparkles size={24}/></div>;
  return <img src={safeURL(item.previewUrl)} alt={item.title} loading="lazy" className={className} onError={()=>setFailed(true)}/>;
}
function SourceLink({item,label}:{item:MediaItem;label:string}) { return <a href={safeURL(item.sourceUrl)} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={13}/></a>; }
function VideoCard({item,t,onPlay}:{item:MediaItem;t:typeof messages.en;onPlay:(item:MediaItem)=>void}) {
  const duration=item.durationSeconds?`${Math.floor(item.durationSeconds/60)}:${String(item.durationSeconds%60).padStart(2,"0")}`:null;
  return <article className="media-card video-card">
    <button className="video-preview" onClick={()=>onPlay(item)} disabled={!safeURL(item.embedUrl)} aria-label={`${t.play}: ${item.title}`}><Preview item={item}/><span className="play-circle"><Play size={20} fill="currentColor"/></span>{duration&&<span className="video-duration">{duration}</span>}</button>
    <h4>{item.title}</h4><p>{item.creator}</p><SourceLink item={item} label={t.source}/>
  </article>;
}
function MediaSection({provider,result,locale,retry,reduced,onPlay}:{provider:Provider;result:ProviderResult;locale:Locale;retry:()=>void;reduced:boolean;onPlay:(item:MediaItem)=>void}) {
  const t=messages[locale];
  const titles={wikipedia:t.context,youtube:t.watchLearn,giphy:t.gifs,freesound:t.listen,art:t.art};
  const icons={wikipedia:BookOpen,youtube:Play,giphy:Sparkles,freesound:Music2,art:Palette};
  const Icon=icons[provider];
  const message=result.status==="empty"?(provider==="youtube"?t.noLearningVideos:t.noMedia):result.reason==="credentials"?t.credentials:result.reason==="quota"?t.quota:result.reason==="timeout"?t.timeout:t.network;
  return <section className={`media-section ${provider}-section`} aria-label={titles[provider]} aria-busy={result.status==="loading"}>
    <div className="section-heading"><h3><Icon size={17}/>{titles[provider]}</h3>{provider==="giphy"&&<a className="giphy-credit" href="https://giphy.com" target="_blank" rel="noopener noreferrer">Powered By <strong>GIPHY</strong><span className="giphy-bars" aria-hidden="true"/></a>}</div>
    {provider==="youtube"&&result.status==="ready"&&<p className="video-section-hint">{t.learningVideosHint}</p>}
    {result.status==="loading"?<div className="loading-state"><LoaderCircle className={reduced?"":"spin"} size={18}/>{t.loading}<div className="skeleton-line"/><div className="skeleton-line short"/></div>:result.status!=="ready"?<div className="source-empty"><p>{message}</p>{result.reason!=="credentials"&&<button onClick={retry}>{t.retry}<ChevronRight size={14}/></button>}</div>:provider==="wikipedia"?result.items.map(item=><article className="wiki-content" key={item.id}><div className="wiki-label"><span>{t.wiki}</span>{item.language!==locale&&<span className="fallback-badge">{t.fallback}</span>}</div><h4>{item.title}</h4><p>{item.excerpt}</p><div className="attribution"><SourceLink item={item} label="Wikipedia"/><a href={safeURL(item.revisionUrl)} target="_blank" rel="noopener noreferrer">{t.revision}</a><a href={safeURL(item.licenseUrl)} target="_blank" rel="noopener noreferrer">{item.license}</a></div></article>):<div className={`media-items ${provider}`}>
      {result.items.map(item=>provider==="youtube"?<VideoCard key={item.id} item={item} t={t} onPlay={onPlay}/>:provider==="giphy"?<a key={item.id} href={safeURL(item.sourceUrl)} target="_blank" rel="noopener noreferrer" className="gif-card"><Preview item={item}/><span>{item.title}<ArrowUpRight size={13}/></span></a>:provider==="freesound"?<article className="media-card sound-card" key={item.id}><span className="sound-icon"><Music2 size={22}/></span><h4>{item.title}</h4><p>{item.creator}</p><audio controls preload="none" src={safeURL(item.previewUrl)} aria-label={item.title}/><div className="attribution"><SourceLink item={item} label={t.source}/><a href={safeURL(item.licenseUrl)} target="_blank" rel="noopener noreferrer">{item.license}</a></div></article>:<article className="media-card art-card" key={item.id}><a href={safeURL(item.sourceUrl)} target="_blank" rel="noopener noreferrer"><Preview item={item}/></a><span className="art-kind">{item.kind}</span><h4>{item.title}</h4><p>{item.creator} {item.date&&`· ${item.date}`}</p><div className="attribution"><SourceLink item={item} label={t.source}/><a href={safeURL(item.licenseUrl)} target="_blank" rel="noopener noreferrer">{item.license}</a></div></article>)}
    </div>}
  </section>;
}

export default function Gallery({emoji,glyph,locale,initialTopic,reduced,onClose,onRemember,onFavorite,isFavorite}:{emoji:EmojiRecord;glyph:string;locale:Locale;initialTopic?:TopicCandidate;reduced:boolean;onClose:()=>void;onRemember:(d:Discovery)=>void;onFavorite:(d:Discovery)=>void;isFavorite:(d:Discovery)=>boolean}) {
  const t=messages[locale];
  const [topic,setTopic]=useState(initialTopic||defaultTopic(emoji,locale));
  const [trail,setTrail]=useState<TopicCandidate[]>([]);
  const [alternatives,setAlternatives]=useState<TopicCandidate[]>([]);
  const [resolving,setResolving]=useState(!initialTopic);
  const [results,setResults]=useState(emptyResults);
  const [activeVideo,setActiveVideo]=useState<MediaItem|null>(null);
  const [changing,setChanging]=useState(false);
  const [query,setQuery]=useState("");
  const [searching,setSearching]=useState(false);
  const [subjectResults,setSubjectResults]=useState<TopicCandidate[]|null>(null);
  const dialog=useRef<HTMLDivElement>(null);
  const requestGeneration=useRef(0);
  const controllers=useRef(new Map<Provider,AbortController>());
  const subjectController=useRef<AbortController|null>(null);
  const discovery:Discovery={emojiId:emoji.id,topic,at:Date.now()};
  function pauseMedia(){dialog.current?.querySelectorAll<HTMLMediaElement>("audio, video").forEach(media=>media.pause());}
  function closeGallery(){setActiveVideo(null);pauseMedia();onClose();}

  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const node=dialog.current; node?.focus();
    const key=(e:KeyboardEvent)=>{
      if(node?.querySelector("dialog[open]"))return;
      if(e.key==="Escape"){e.preventDefault();pauseMedia();onClose();}
      if(e.key==="Tab"&&node){
        const elements=Array.from(node.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, audio[controls], iframe')).filter(el=>el.getClientRects().length);
        const first=elements[0],last=elements[elements.length-1];
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===node)){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===node)){e.preventDefault();first?.focus();}
      }
    };
    const overflow=document.body.style.overflow; document.body.style.overflow="hidden";
    document.addEventListener("keydown",key);
    return ()=>{node?.querySelectorAll<HTMLMediaElement>("audio, video").forEach(media=>media.pause());document.removeEventListener("keydown",key);document.body.style.overflow=overflow;previous?.focus();subjectController.current?.abort();};
  },[onClose]);

  useEffect(()=>{
    if(initialTopic) return;
    const controller=new AbortController();
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(5000)]);
    fetch(`/api/resolve?emojiId=${encodeURIComponent(emoji.id)}&locale=${locale}`,{signal}).then(async r=>{if(!r.ok)throw new Error();return await r.json() as Resolution;}).then(data=>{
      if(controller.signal.aborted)return;
      if(validTopic(data.defaultTopic))setTopic(data.defaultTopic);
      setAlternatives(data.alternatives.filter(validTopic).slice(0,3));
    }).catch(()=>{/* Local subject remains available. */}).finally(()=>{if(!controller.signal.aborted)setResolving(false);});
    return ()=>controller.abort();
  },[emoji.id,locale,initialTopic]);

  const loadSource=useCallback(async(provider:Provider)=>{
    const generation=requestGeneration.current;
    controllers.current.get(provider)?.abort();
    const controller=new AbortController(); controllers.current.set(provider,controller);
    setResults(r=>({...r,[provider]:loading}));
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(8000)]);
    try {
      let result:ProviderResult;
      if(provider==="giphy")result=await searchGiphy(topic.query,locale,signal);
      else{
        const response=await fetch("/api/discover",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({emojiId:emoji.id,locale,topic,provider}),signal});
        if(!response.ok)throw new Error("Unavailable"); result=await response.json();
      }
      if(!controller.signal.aborted&&generation===requestGeneration.current)setResults(r=>({...r,[provider]:result}));
    }catch{
      if(!controller.signal.aborted&&generation===requestGeneration.current)setResults(r=>({...r,[provider]:{status:"error",items:[],reason:signal.aborted?"timeout":"network"}}));
    }
  },[emoji.id,locale,topic]);
  useEffect(()=>{
    if(resolving)return;
    requestGeneration.current++;
    setResults(emptyResults());
    onRemember({emojiId:emoji.id,topic,at:Date.now()});
    providers.forEach(p=>void loadSource(p));
    const requests=controllers.current;
    return ()=>{requestGeneration.current++;requests.forEach(c=>c.abort());requests.clear();};
  },[resolving,loadSource,emoji.id,topic,onRemember]);
  async function findSubjects(event:React.FormEvent){
    event.preventDefault(); if(!query.trim())return;
    subjectController.current?.abort();const controller=new AbortController();subjectController.current=controller;
    setSearching(true);setSubjectResults(null);
    try{
      const response=await fetch(`/api/resolve?emojiId=${encodeURIComponent(emoji.id)}&locale=${locale}&q=${encodeURIComponent(query.trim())}`,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(5000)])});
      if(!response.ok)throw new Error();
      const data=await response.json() as Resolution;
      if(!controller.signal.aborted)setSubjectResults([data.defaultTopic,...data.alternatives].filter(c=>validTopic(c)&&c.wikiTitle).filter((c,i,a)=>a.findIndex(v=>v.wikiTitle===c.wikiTitle)===i));
    }catch{if(!controller.signal.aborted)setSubjectResults([]);}finally{if(!controller.signal.aborted)setSearching(false);}
  }
  function navigate(next:TopicCandidate){
    setActiveVideo(null);pauseMedia();requestGeneration.current++;controllers.current.forEach(c=>c.abort());
    subjectController.current?.abort();setSearching(false);setResults(emptyResults());
    setTopic(next);setChanging(false);setSubjectResults(null);
    requestAnimationFrame(()=>{dialog.current?.scrollTo({top:0,behavior:"instant"});dialog.current?.querySelector<HTMLElement>("#gallery-title")?.focus();});
  }
  function chooseTopic(next:TopicCandidate){setTrail(previous=>[...previous,topic].slice(-20));navigate(next);}
  function goBack(){const previous=trail.at(-1);if(previous){setTrail(trail.slice(0,-1));navigate(previous);}}

  return <motion.div className={`gallery-backdrop ${reduced?"reduced":""}`} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={e=>{if(e.target===e.currentTarget)closeGallery();}}>
    <motion.div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="gallery-title" tabIndex={-1} className="gallery" initial={{opacity:0,y:reduced?0:32,scale:reduced?1:.97}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:reduced?0:20}} transition={{duration:reduced?.1:.28}}>
      <div className="gallery-top"><span><Sparkles size={14}/>{t.discovery}</span><button className="icon-button" onClick={closeGallery} aria-label={t.close}><X size={22}/></button></div>
      <header className="gallery-header"><span className="gallery-emoji">{glyph}</span><div><h2 id="gallery-title" tabIndex={-1}>{resolving?emoji.labels[locale]:topic.label}</h2>{(resolving||topic.suggested)&&<p className="gallery-subtitle">{resolving?t.loadingSubject:t.suggested}</p>}</div><button className={`favorite-button ${isFavorite(discovery)?"active":""}`} disabled={resolving} aria-label={isFavorite(discovery)?t.unfavorite:t.favorite} onClick={()=>onFavorite(discovery)}><Heart size={20} fill={isFavorite(discovery)?"currentColor":"none"}/></button></header>
      {trail.length>0&&<nav className="exploration-trail" aria-label={locale==="es"?"Camino de exploración":"Exploration path"}><button onClick={goBack}>← {locale==="es"?"Volver a":"Back to"} {trail.at(-1)?.label}</button></nav>}
      <div className="topic-bar"><div>{alternatives.some(c=>c.label!==topic.label)&&<span>{t.alternative}</span>}{alternatives.filter(c=>c.label!==topic.label).map(c=><button key={c.wikiTitle||c.label} onClick={()=>chooseTopic(c)} disabled={resolving}>{c.label}<ChevronRight size={12}/></button>)}</div><button className="change-subject" onClick={()=>setChanging(!changing)} disabled={resolving}><Search size={14}/>{t.change}</button></div>
      <AnimatePresence>{changing&&<motion.div className="subject-picker" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><form onSubmit={findSubjects}><Search size={17}/><input autoFocus maxLength={150} aria-label={t.subjectSearch} placeholder={t.subjectSearch} value={query} onChange={e=>setQuery(e.target.value)}/><button className="primary-button" disabled={searching||!query.trim()}>{searching?<LoaderCircle size={16} className="spin"/>:t.find}</button></form>{subjectResults&&<div className="subject-results" aria-label={t.results}>{subjectResults.length?subjectResults.map(c=><button onClick={()=>chooseTopic(c)} key={c.wikiTitle}><BookOpen size={14}/>{c.label}<ChevronRight size={14}/></button>):<p>{t.noSubjects}</p>}</div>}</motion.div>}</AnimatePresence>
      <div className="gallery-body"><WikipediaContext key={`${topic.label}:${topic.language}`} result={resolving?loading:results.wikipedia} topic={topic} emojiLabel={emoji.labels[locale]} locale={locale} reduced={reduced} retry={()=>void loadSource("wikipedia")} change={()=>setChanging(true)} choose={chooseTopic}/>{providers.filter(p=>p!=="wikipedia").map(p=><MediaSection key={`${topic.label}:${topic.language}:${p}`} provider={p} result={resolving?loading:results[p]} locale={locale} reduced={reduced} retry={()=>void loadSource(p)} onPlay={item=>{pauseMedia();setActiveVideo(item);}}/>)}</div>
      {activeVideo&&<VideoPlayer item={activeVideo} locale={locale} onClose={()=>setActiveVideo(null)}/>}
      <footer className="gallery-footer"><Check size={13}/>{t.stop}</footer>
    </motion.div>
  </motion.div>;
}

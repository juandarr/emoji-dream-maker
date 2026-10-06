"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, getClientRect, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { AnimatePresence } from "motion/react";
import dynamic from "next/dynamic";
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Compass, Grid2X2, Heart, History, List, Moon, Shapes, Orbit, Search, Shuffle, Trash2, X } from "lucide-react";
import { catalog, defaultTopic, categories, constellationPositions, emojiById, searchCatalog } from "@/lib/catalog";
import type { ConstellationPosition } from "@/lib/catalog";
import { messages } from "@/lib/i18n";
import { playgroundLabels } from "@/features/playground/labels";
import { discoveryKey, initialPreferences, readPreferences, remember, savePreferences } from "@/lib/storage";
import type { Preferences } from "@/lib/storage";
import type { Discovery, EmojiRecord, Locale, TopicCandidate } from "@/lib/types";
import { loadVideos } from "@/lib/video-prefetch";
import BlackHole from "./BlackHole";
import { GravityEmoji, GravityField, useGravity } from "./GravityLens";
const Gallery = dynamic(() => import("./Gallery"));
const Playground = dynamic(() => import("@/features/playground/Playground"));

function EmojiButton({emoji,locale,selected,onSelect,position,view}:{emoji:EmojiRecord;locale:Locale;selected:boolean;onSelect:()=>void;position:ConstellationPosition;view:Preferences["view"]}) {
  const {attributes,listeners,setNodeRef,isDragging}=useDraggable({id:emoji.id});
  const button=<button ref={setNodeRef} {...attributes} {...listeners} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();onSelect();}else listeners?.onKeyDown?.(event);}} onClick={onSelect} title={emoji.labels[locale]} aria-label={emoji.labels[locale]} aria-pressed={selected} className={`emoji-button ${selected?"selected":""} ${isDragging?"dragging":""}`}>
    <span className="emoji-glyph">{emoji.glyph}</span><span className="emoji-label">{emoji.labels[locale]}</span>
  </button>;
  return view==="constellation"?<div className="emoji-orbit" style={{"--angle":`${position.angle}deg`,"--radius":`${position.radius}%`,"--period":`${position.duration}s`} as React.CSSProperties}>{button}</div>:button;
}
function Portal({locale,selected,onOpen,reduced,paused}:{locale:Locale;selected:boolean;onOpen:()=>void;reduced:boolean;paused:boolean}) {
  const {setNodeRef,isOver}=useDroppable({id:"portal"});
  const {field,portal}=useGravity();
  const connect=useCallback((element:HTMLDivElement|null)=>{setNodeRef(element);portal.current=element;},[setNodeRef,portal]);
  const t=messages[locale];
  return <div ref={connect} className={`portal-target ${isOver?"over":""}`}><button className="portal" onClick={onOpen} disabled={!selected} aria-label={t.open}><BlackHole gravity={field} reduced={reduced} paused={paused}/></button><span className="portal-instruction">{t.portalHint}</span></div>;
}
const stars=Array.from({length:65},(_,i)=>({left:`${(i*37+13)%100}%`,top:`${(i*61+7)%100}%`,opacity:.15+(i%4)*.13,size:i%9===0?3:1.4}));
// Orbit rotations and portal translations position these nodes. Keep them in
// their measured rectangles rather than treating them as drag transforms.
const dragMeasuring={draggable:{measure:getClientRect},droppable:{measure:getClientRect}};

export default function Explorer() {
  const [prefs,setPrefs]=useState<Preferences>(initialPreferences);
  const [ready,setReady]=useState(false);
  const [storageFailed,setStorageFailed]=useState(false);
  const [notice,setNotice]=useState("");
  const [query,setQuery]=useState("");
  const [debounced,setDebounced]=useState("");
  const [group,setGroup]=useState<number|null>(null);
  const [page,setPage]=useState(0);
  const [tab,setTab]=useState<"discover"|"favorites"|"history"|"playground">("discover");
  const [playgroundSeed,setPlaygroundSeed]=useState<{id:string;emoji:EmojiRecord;glyph:string}|null>(null);
  const [playgroundOpened,setPlaygroundOpened]=useState(false);
  const [selected,setSelected]=useState<EmojiRecord|null>(null);
  const [variant,setVariant]=useState<string|null>(null);
  const [dragging,setDragging]=useState<string|null>(null);
  const [dragSize,setDragSize]=useState(60);
  const [gallery,setGallery]=useState<{emoji:EmojiRecord;glyph:string;topic?:TopicCandidate;key:number}|null>(null);
  const [systemReduced,setSystemReduced]=useState(false);
  const reduced=!!systemReduced||prefs.reduced;
  const locale=prefs.locale,t=messages[locale];
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor));
  useEffect(()=>{try{setPrefs(readPreferences(window.localStorage));}catch{setStorageFailed(true);}setReady(true);},[]);
  useEffect(()=>{if(ready){try{setStorageFailed(!savePreferences(window.localStorage,prefs));}catch{setStorageFailed(true);}}document.documentElement.lang=prefs.locale;},[prefs,ready]);
  useEffect(()=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");const update=()=>setSystemReduced(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  useEffect(()=>{if(query===debounced)return;const timer=setTimeout(()=>{setDebounced(query);setPage(0);},150);return()=>clearTimeout(timer);},[query,debounced]);
  const matches=useMemo(()=>searchCatalog(debounced,group),[debounced,group]);
  const pages=Math.max(1,Math.ceil(matches.length/48));
  const visible=matches.slice(Math.min(page,pages-1)*48,(Math.min(page,pages-1)+1)*48);
  const positions=constellationPositions(visible);
  useEffect(()=>{
    if(!selected||tab!=="discover")return;
    const controller=new AbortController();
    void loadVideos(selected.id,defaultTopic(selected,locale),locale,controller.signal).catch(()=>{});
    return ()=>controller.abort();
  },[selected,locale,tab]);
  const choose=(emoji:EmojiRecord)=>{void import("./Gallery");setSelected(emoji);setVariant(null);};
  const open=useCallback((emoji:EmojiRecord,glyph?:string,topic?:TopicCandidate)=>setGallery({emoji,glyph:glyph||emoji.glyph,topic,key:Date.now()}),[]);
  const close=useCallback(()=>setGallery(null),[]);
  const onRemember=useCallback((item:Discovery)=>setPrefs(p=>({...p,history:remember(p.history,item,50)})),[]);
  const isFavorite=useCallback((item:Discovery)=>prefs.favorites.some(d=>discoveryKey(d)===discoveryKey(item)),[prefs.favorites]);
  const onFavorite=useCallback((item:Discovery)=>{
    if(!isFavorite(item)&&prefs.favorites.length>=200){setNotice(messages[locale].maxFavorites);return;}
    setPrefs(p=>({...p,favorites:p.favorites.some(d=>discoveryKey(d)===discoveryKey(item))?p.favorites.filter(d=>discoveryKey(d)!==discoveryKey(item)):remember(p.favorites,item,200)}));
  },[isFavorite,prefs.favorites.length,locale]);
  const selectedGlyph=variant||selected?.glyph;
  function startDrag(event:DragStartEvent){
    const target=event.activatorEvent.target;
    const glyph=target instanceof Element?target.closest(".emoji-button")?.querySelector(".emoji-glyph"):null;
    setDragSize(glyph?parseFloat(getComputedStyle(glyph).fontSize)*2:60);
    setDragging(String(event.active.id));
    const emoji=emojiById.get(String(event.active.id));if(emoji)choose(emoji);
  }
  function endDrag(event:DragEndEvent){setDragging(null);if(event.over?.id==="portal"){const emoji=emojiById.get(String(event.active.id));if(emoji){choose(emoji);open(emoji);}}}
  function surprise(){const source=matches.length?matches:catalog;const emoji=source[Math.floor(Math.random()*source.length)];choose(emoji);open(emoji);}
  const saved=tab==="favorites"?prefs.favorites:prefs.history;
  const activeRecord=dragging?emojiById.get(dragging):null;
  return <>
    <div className={`app-shell ${reduced?"reduced":""}`} inert={!!gallery}>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Dream Maker"><span className="brand-icon"><img src="/icon.svg" width={40} height={40} alt=""/></span><span>dream<span className="brand-light">maker</span></span></a>
        <div className="sidebar-body"><nav aria-label={t.discover}>
          <div className="discovery-menu">
            <button aria-current={tab==="discover"?"page":undefined} title={t.discover} className={`nav-discover ${tab==="discover"?"active":""} ${tab==="favorites"||tab==="history"?"in-section":""}`} onClick={()=>setTab("discover")}><Compass size={19}/>{t.discover}<ChevronDown className="nav-group-chevron" size={14}/><span className="nav-active-dot"/></button>
            <div className="discovery-subnav" role="group" aria-label={t.discover}>
              <button aria-current={tab==="favorites"?"page":undefined} title={t.favorites} className={`nav-favorites ${tab==="favorites"?"active":""}`} onClick={()=>setTab("favorites")}><Heart size={19}/>{t.favorites}<span className="nav-count">{prefs.favorites.length}</span></button>
              <button aria-current={tab==="history"?"page":undefined} title={t.history} className={`nav-history ${tab==="history"?"active":""}`} onClick={()=>setTab("history")}><History size={19}/>{t.history}<span className="nav-count">{prefs.history.length}</span></button>
            </div>
          </div>
          <button aria-current={tab==="playground"?"page":undefined} title={playgroundLabels[locale].name} className={`nav-playground ${tab==="playground"?"active":""}`} onClick={()=>{setPlaygroundOpened(true);setTab("playground");}}><Shapes size={19}/>{playgroundLabels[locale].name}<span className="nav-active-dot"/></button>
        </nav>
        </div>
        <div className="preferences"><label className="language-picker"><span>{t.locale}</span><select aria-label={t.locale} value={locale} onChange={e=>setPrefs(p=>({...p,locale:e.target.value as Locale}))}><option value="en">English</option><option value="es">Español</option></select></label><button className="motion-toggle" aria-pressed={reduced} onClick={()=>setPrefs(p=>({...p,reduced:!p.reduced}))}><Moon size={14}/>{t.reduced}<span className={`toggle ${reduced?"on":""}`}/></button><p><span className="privacy-dot"/>{t.local}</p></div>
      </aside>
      <main className={`main-content section-${tab}`}>
        <section className="intro"><h1>{tab==="discover"?t.title:tab==="playground"?playgroundLabels[locale].title:tab==="favorites"?t.saved:t.recent}</h1><p>{tab==="discover"?t.intro:tab==="playground"?playgroundLabels[locale].intro:tab==="favorites"?t.savedIntro:t.historyIntro}</p></section>
        {(storageFailed||notice)&&<div role="status" className="storage-notice">{notice||t.storage}{notice&&<button onClick={()=>setNotice("")} aria-label={t.close}><X size={14}/></button>}</div>}
        {playgroundOpened&&<div hidden={tab!=="playground"}><Playground locale={locale} seed={playgroundSeed}/></div>}
        {tab==="playground"?null:tab==="discover"?<>
          <div className="search-row"><label className="search-box"><Search size={21}/><input aria-label={t.search} placeholder={t.search} value={query} onChange={e=>setQuery(e.target.value)} maxLength={150}/>{query?<button onClick={()=>setQuery("")} aria-label={t.clearSearch}><X size={16}/></button>:<span className="search-mark">✧</span>}</label><button className="surprise-button" onClick={surprise} aria-label={t.surprise}><Shuffle size={16}/><span>{t.surprise}</span></button></div>
          <div className="category-strip" aria-label={t.all}><button aria-pressed={group===null} className={group===null?"active":""} onClick={()=>{setGroup(null);setPage(0);}}>{t.all}</button>{categories.map(c=><button aria-pressed={group===c.id} className={group===c.id?"active":""} key={c.id} onClick={()=>{setGroup(c.id);setPage(0);}}><span>{c.icon}</span>{c[locale]}</button>)}</div>
          <div className="explorer-workspace"><div className="canvas-column"><div className="canvas-toolbar"><span><span className="count-dot"/>{matches.length.toLocaleString(locale)} {t.matches}</span><div className="view-switch" aria-label={t.view}>{([{value:"constellation",Icon:Orbit,label:t.constellation},{value:"grid",Icon:Grid2X2,label:t.grid},{value:"list",Icon:List,label:t.list}] as const).map(({value,Icon,label})=><button key={value} aria-label={label} title={label} aria-pressed={prefs.view===value} className={prefs.view===value?"active":""} onClick={()=>setPrefs(p=>({...p,view:value}))}><Icon size={16}/></button>)}</div></div>
          <DndContext id="emoji-constellation" sensors={sensors} measuring={dragMeasuring} collisionDetection={args=>{const hits=pointerWithin(args);return hits.length?hits:rectIntersection(args);}} onDragStart={startDrag} onDragEnd={endDrag} onDragCancel={()=>setDragging(null)}>
            <GravityField glyph={activeRecord?.glyph||""} reduced={reduced} paused={!!gallery}>
            <div className={`dream-canvas ${prefs.view} ${dragging?"is-dragging":""} ${gallery?"paused":""}`}>
              <div className="starfield" aria-hidden="true">{stars.map((s,i)=><i key={i} style={{left:s.left,top:s.top,opacity:s.opacity,width:s.size,height:s.size}}/>)}</div><div className="orbit-guide guide-one" aria-hidden="true"/><div className="orbit-guide guide-middle" aria-hidden="true"/><div className="orbit-guide guide-two" aria-hidden="true"/>
              <div className="canvas-corner top-left"/><div className="canvas-corner bottom-right"/>
              <Portal locale={locale} selected={!!selected} onOpen={()=>selected&&open(selected,selectedGlyph)} reduced={reduced} paused={!!gallery}/>
              <div className="emoji-field" aria-label={t.matches}>{visible.map((emoji,i)=><EmojiButton key={emoji.id} emoji={emoji} locale={locale} selected={selected?.id===emoji.id} onSelect={()=>choose(emoji)} position={positions[i]} view={prefs.view}/>)}</div>
              {!visible.length&&<div className="canvas-empty"><Search size={26}/><h3>{t.empty}</h3><p>{t.emptyHint}</p></div>}
            </div>
            <DragOverlay dropAnimation={null}>{activeRecord&&<GravityEmoji glyph={activeRecord.glyph} label={activeRecord.labels[locale]} size={dragSize} reduced={reduced}/>}</DragOverlay>
            </GravityField>
          </DndContext>
          <div className="pagination"><span>{t.page} {Math.min(page,pages-1)+1} / {pages}</span><div><button disabled={page<=0} onClick={()=>setPage(p=>p-1)} aria-label={t.previous}><ChevronLeft size={17}/></button><button disabled={page>=pages-1} onClick={()=>setPage(p=>p+1)} aria-label={t.next}><ChevronRight size={17}/></button></div></div></div>
          <aside className="discovery-rail"><div className={`selection-card ${selected?"has-selection":""}`}>{selected&&<p className="eyebrow">{t.selected}</p>}<div className={`selection-art ${selected?"has-selection":""}`}><span className="selection-ring"/><span>{selectedGlyph||"✧"}</span><i>✦</i><i>·</i></div><h2>{selected?selected.labels[locale]:t.select}</h2>{!selected&&<p>{t.pickHint}</p>}{selected?.association&&<p className="association-note">{selected.association[locale]}</p>}
          {!!selected?.variants.length&&<label className="variant-picker">{t.variants}<select aria-label={t.variants} value={variant||selected.glyph} onChange={e=>setVariant(e.target.value)}><option value={selected.glyph}>{selected.glyph} {selected.labels[locale]}</option>{selected.variants.map(v=><option key={v.id} value={v.glyph}>{v.glyph} {v.labels[locale]}</option>)}</select></label>}
          <button className="primary-button open-button" disabled={!selected} onClick={()=>selected&&open(selected,selectedGlyph)}>{t.open}<ArrowRight size={17}/></button><button className="pg-add-from-discover" disabled={!selected} onClick={()=>{if(selected){setPlaygroundSeed({id:crypto.randomUUID(),emoji:selected,glyph:selectedGlyph||selected.glyph});setPlaygroundOpened(true);setTab("playground");}}}><Shapes size={15}/>{playgroundLabels[locale].start}</button></div>
          <div className="curiosity-card"><p className="eyebrow">{t.try}</p>{t.tips.map((word,i)=><button key={word} onClick={()=>{setQuery(word);setGroup(null);}}><span>{["🌊","🎵","❤️","🪐"][i]}</span>{word}<ArrowUpRightIcon/></button>)}</div>
          </aside></div>
        </>:<section className="saved-section"><div className="saved-toolbar"><span>{saved.length} {t.count}</span><button disabled={!saved.length} onClick={()=>setPrefs(p=>({...p,[tab]:[]}))}><Trash2 size={14}/>{t.clear}</button></div>{saved.length?<div className="saved-grid">{saved.map(item=>{const emoji=emojiById.get(item.emojiId)!;return <button className="saved-card" key={discoveryKey(item)} onClick={()=>{choose(emoji);open(emoji,emoji.glyph,item.topic);}}><span>{emoji.glyph}</span><h2>{item.topic.label}</h2>{item.topic.label.toLocaleLowerCase(locale)!==emoji.labels[locale].toLocaleLowerCase(locale)&&<p>{emoji.labels[locale]}</p>}<ArrowRight size={17}/></button>;})}</div>:<div className="saved-empty">{tab==="favorites"?<Heart size={48} strokeWidth={1.2}/>:<History size={48} strokeWidth={1.2}/>}<h2>{tab==="favorites"?t.savedEmpty:t.historyEmpty}</h2><button className="primary-button" onClick={()=>setTab("discover")}>{t.back}<ArrowRight size={16}/></button></div>}</section>}
      </main>
    </div>
    <AnimatePresence>{gallery&&<Gallery key={gallery.key} emoji={gallery.emoji} glyph={gallery.glyph} initialTopic={gallery.topic} locale={locale} reduced={reduced} onClose={close} onRemember={onRemember} onFavorite={onFavorite} isFavorite={isFavorite}/>}</AnimatePresence>
  </>;
}
function ArrowUpRightIcon(){return <span className="thread-arrow">↗</span>;}

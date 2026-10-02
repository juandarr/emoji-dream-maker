"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Copy, Download, Plus, Redo2, Search, Sparkles, Trash2, Undo2, Upload, X } from "lucide-react";
import { categories, emojiById, searchCatalog } from "@/lib/catalog";
import type { EmojiRecord, Locale } from "@/lib/types";
import { boardReducer, clamp, compileBrief, createNode, emptyComposition, NODE_LIMIT, parseComposition, semanticIdentity, type BoardNode } from "./model";
import { loadWorkspace, saveWorkspace, type Workspace } from "./storage";
import { playgroundLabels } from "./labels";
import { outputKinds, reasoningEfforts, type ReasoningEffort, type GenerationRun, type GenerationSettings, type OutputKind } from "@/features/generation/model";

type Seed={id:string;emoji:EmojiRecord;glyph:string};
type Config={configured:boolean;models:string[];maxOutputTokens:number;reasoningEffort?:ReasoningEffort};
function PaletteEmoji({emoji,locale,onAdd,disabled}:{emoji:EmojiRecord;locale:Locale;onAdd:()=>void;disabled:boolean}) {
  const {setNodeRef,attributes,listeners,isDragging}=useDraggable({id:`tray:${emoji.id}`,disabled});
  const t=playgroundLabels[locale];
  return <button ref={setNodeRef} {...attributes} {...listeners} disabled={disabled} onClick={onAdd} aria-label={`${t.add} ${emoji.labels[locale]}`} title={emoji.labels[locale]} className={`pg-palette-emoji ${isDragging?"dragging":""}`}><span>{emoji.glyph}</span><small>{emoji.labels[locale]}</small></button>;
}
function PlacedEmoji({node,selected,onSelect,onUpdate,onRemove,locale}:{node:BoardNode;selected:boolean;onSelect:()=>void;onUpdate:(patch:Partial<BoardNode>)=>void;onRemove:()=>void;locale:Locale}) {
  const {setNodeRef,attributes,listeners,transform,isDragging}=useDraggable({id:`node:${node.id}`});
  return <button ref={setNodeRef} {...attributes} {...listeners} aria-label={`${node.glyph} ${node.meaning}`} aria-pressed={selected} className={`pg-node ${selected?"selected":""} ${isDragging?"dragging":""}`} style={{left:`${node.x}%`,top:`${node.y}%`,transform:`translate(calc(-50% + ${transform?.x||0}px), calc(-50% + ${transform?.y||0}px))`}} onClick={onSelect} onFocus={onSelect} onKeyDown={e=>{
    if(!isDragging&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();onUpdate({x:clamp(node.x+(e.key==="ArrowRight"?2:e.key==="ArrowLeft"?-2:0)),y:clamp(node.y+(e.key==="ArrowDown"?2:e.key==="ArrowUp"?-2:0))});}
    else if(!isDragging&&(e.key==="Delete"||e.key==="Backspace")){e.preventDefault();onRemove();}
    else listeners?.onKeyDown?.(e);
  }}><span>{node.glyph}</span></button>;
}
function Board({children,boardRef}:{children:React.ReactNode;boardRef:React.RefObject<HTMLDivElement|null>}) {
  const {setNodeRef,isOver}=useDroppable({id:"composition-board"});
  return <div ref={el=>{setNodeRef(el);boardRef.current=el;}} className={`pg-board ${isOver?"over":""}`}>{children}</div>;
}
function MeaningField({value,onCommit,label}:{value:string;onCommit:(v:string)=>void;label:string}) {
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  return <label>{label}<input aria-label={label} value={draft} maxLength={150} onChange={e=>setDraft(e.target.value)} onBlur={()=>{const next=draft.trim()||value;setDraft(next);onCommit(next);}} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/></label>;
}
function download(value:unknown,name:string) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function Playground({locale,seed}:{locale:Locale;seed:Seed|null}) {
  const t=playgroundLabels[locale];
  const [history,dispatch]=useReducer(boardReducer,{past:[],present:emptyComposition(),future:[]});
  const board=history.present;
  const [ready,setReady]=useState(false),[readFailed,setReadFailed]=useState(false),[saveStatus,setSaveStatus]=useState<"saved"|"saving"|"failed">("saved");
  const [selectedId,setSelectedId]=useState<string|null>(null),[query,setQuery]=useState(""),[group,setGroup]=useState<number|null>(null),[sort,setSort]=useState("relevance"),[page,setPage]=useState(0);
  const [target,setTarget]=useState(""),[relation,setRelation]=useState(""),[dragging,setDragging]=useState<string|null>(null),[notice,setNotice]=useState("");
  const [runs,setRuns]=useState<GenerationRun[]>([]),[busy,setBusy]=useState(false),[config,setConfig]=useState<Config|null>(null),[configFailed,setConfigFailed]=useState(false);
  const [reasoningEffort,setReasoningEffort]=useState<ReasoningEffort>("default"),[pendingResultId,setPendingResultId]=useState<string|null>(null);
  const resultsRef=useRef<HTMLElement|null>(null);
  const [kind,setKind]=useState<OutputKind>("poem"),[outputLocale,setOutputLocale]=useState<Locale>(locale),[tone,setTone]=useState(""),[model,setModel]=useState("");
  const boardRef=useRef<HTMLDivElement|null>(null),fileRef=useRef<HTMLInputElement|null>(null),consumedSeed=useRef(""),saveQueue=useRef<Promise<void>>(Promise.resolve()),saveVersion=useRef(0),busyRef=useRef(false);
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}),useSensor(KeyboardSensor));
  const persist=useCallback((workspace:Workspace)=>{
    const version=++saveVersion.current;setSaveStatus("saving");
    const save=saveQueue.current.catch(()=>{}).then(()=>saveWorkspace(workspace));
    saveQueue.current=save;
    void save.then(()=>{if(version===saveVersion.current)setSaveStatus("saved");},()=>{if(version===saveVersion.current)setSaveStatus("failed");});
    return save;
  },[]);
  useEffect(()=>{let alive=true;void loadWorkspace().then(saved=>{if(alive&&saved){dispatch({type:"load",board:saved.board});setRuns(saved.runs);}},()=>{if(alive)setReadFailed(true);}).finally(()=>{if(alive)setReady(true);});return()=>{alive=false;};},[]);
  useEffect(()=>{if(ready&&!readFailed)void persist({board,runs}).catch(()=>{});},[ready,readFailed,board,runs,persist]);
  const checkConnection=useCallback(async()=>{
    setConfig(null);setConfigFailed(false);
    try {const response=await fetch("/api/generations",{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error();const next:Config=await response.json();if(!Array.isArray(next.models))throw new Error();setConfig(next);setReasoningEffort(next.reasoningEffort||"default");setModel(current=>next.models.includes(current)?current:next.models[0]||"");}
    catch {setConfigFailed(true);}
  },[]);
  useEffect(()=>{void checkConnection();},[checkConnection]);
  useEffect(()=>{
    if(!pendingResultId || !runs.some(r=>r.id===pendingResultId&&r.status!=="running"))return;
    if(resultsRef.current?.getClientRects().length)resultsRef.current.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    setPendingResultId(null);
  },[runs,pendingResultId]);
  const add=useCallback((emoji:EmojiRecord,position?:{x:number;y:number},glyph?:string)=>{
    if(board.nodes.length>=NODE_LIMIT){setNotice(t.limit);return;}
    const node=createNode(emoji,locale,crypto.randomUUID(),board.nodes.length,position,glyph);dispatch({type:"add",node});setSelectedId(node.id);
  },[board.nodes.length,locale,t.limit]);
  useEffect(()=>{if(ready&&seed&&consumedSeed.current!==seed.id){consumedSeed.current=seed.id;add(seed.emoji,undefined,seed.glyph);}},[ready,seed,add]);
  const matches=useMemo(()=>{
    const result=searchCatalog(query,group);
    if(sort==="alphabetical")result.sort((a,b)=>a.labels[locale].localeCompare(b.labels[locale],locale));
    if(sort==="unicode")result.sort((a,b)=>a.order-b.order);
    return result;
  },[query,group,sort,locale]);
  const pages=Math.max(1,Math.ceil(matches.length/30)),currentPage=Math.min(page,pages-1),visible=matches.slice(currentPage*30,(currentPage+1)*30);
  const selected=board.nodes.find(n=>n.id===selectedId);
  const displayBrief=compileBrief(board,locale);
  function endDrag(event:DragEndEvent) {
    setDragging(null);const rect=boardRef.current?.getBoundingClientRect();if(!rect)return;
    const id=String(event.active.id);
    if(id.startsWith("tray:")&&event.over?.id==="composition-board"){
      const emoji=emojiById.get(id.slice(5)),translated=event.active.rect.current.translated;
      if(emoji&&translated)add(emoji,{x:clamp((translated.left+translated.width/2-rect.left)/rect.width*100),y:clamp((translated.top+translated.height/2-rect.top)/rect.height*100)});
    } else if(id.startsWith("node:")){
      const node=board.nodes.find(n=>n.id===id.slice(5));if(node)dispatch({type:"update",id:node.id,patch:{x:clamp(node.x+event.delta.x/rect.width*100),y:clamp(node.y+event.delta.y/rect.height*100)}});
    }
  }
  async function copy(text:string) {try{await navigator.clipboard.writeText(text);setNotice(t.copied);}catch{setNotice(t.copyFailed);}}
  async function importBoard(file:File) {
    try {if(file.size>512000)throw new Error();const next=parseComposition(JSON.parse(await file.text()));dispatch({type:"replace",board:next});setSelectedId(null);setReadFailed(false);setNotice("");}
    catch {setNotice(t.importError);}
  }
  async function generate() {
    if(busyRef.current||!board.nodes.length||!config?.configured)return;
    busyRef.current=true;setBusy(true);
    const settings:GenerationSettings={kind,locale:outputLocale,tone:tone.trim()||playgroundLabels[outputLocale].toneDefault,model,reasoningEffort};
    const run:GenerationRun={id:crypto.randomUUID(),createdAt:Date.now(),identity:semanticIdentity(board,outputLocale),board:structuredClone(board),brief:compileBrief(board,outputLocale),settings,status:"running"};
    const next=[run,...runs].slice(0,10);setRuns(next);setPendingResultId(run.id);
    // Persist the immutable input before the deliberate submission. No automatic retries.
    if(!readFailed)await persist({board,runs:next}).catch(()=>{});
    try {
      const response=await fetch("/api/generations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:run.id,board:run.board,settings}),signal:AbortSignal.timeout(135000)});
      const data=await response.json();
      setRuns(current=>current.map(r=>r.id===run.id?response.ok&&data.result?{...r,status:"succeeded",result:data.result}:{...r,status:data.code==="unknown"?"unknown":"failed",error:data.error||t.failedRun}:r));
    } catch {setRuns(current=>current.map(r=>r.id===run.id?{...r,status:"unknown",error:t.unknown}:r));}
    finally {busyRef.current=false;setBusy(false);}
  }
  // Canvas nodes move directly; the tray needs a preview to cross its scroll boundary.
  const dragGlyph=dragging?.startsWith("tray:")?emojiById.get(dragging.slice(5))?.glyph:undefined;
  const latestRun=runs[0];
  const effortNames:Record<ReasoningEffort,string>={default:t.reasoningDefault,low:t.reasoningLow,medium:t.reasoningMedium,high:t.reasoningHigh};
  const outputNames:Record<OutputKind,string>={message:t.message,poem:t.poem,story:t.story,lyrics:t.lyrics,"image-prompt":t.imagePrompt,storyboard:t.storyboard};
  if(!ready)return <div className="pg-loading" role="status">{t.loading}</div>;
  return <section className={`playground ${dragging?"is-dragging":""}`} aria-label={t.name}>
    {(notice||readFailed)&&<div className="storage-notice" role="status"><span>{readFailed?t.readFailed:notice}</span>{readFailed?<button onClick={()=>{dispatch({type:"replace",board:emptyComposition()});setReadFailed(false);}}>{t.fresh}</button>:<button aria-label="Close notice" onClick={()=>setNotice("")}><X size={16}/></button>}</div>}
    <div className="pg-topbar"><label className="pg-scene"><span>{t.scene}</span><input aria-label={t.scene} maxLength={120} placeholder={t.scenePlaceholder} value={board.title} onChange={e=>dispatch({type:"fields",patch:{title:e.target.value}})}/></label><div className="pg-file-actions"><button onClick={()=>download(board,"emoji-playground.json")}><Download size={15}/>{t.export}</button><button onClick={()=>fileRef.current?.click()}><Upload size={15}/>{t.import}</button><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void importBoard(file);e.target.value="";}}/></div></div>
    <DndContext id="playground-editor" sensors={sensors} onDragStart={e=>{setDragging(String(e.active.id));if(String(e.active.id).startsWith("node:"))setSelectedId(String(e.active.id).slice(5));}} onDragEnd={endDrag} onDragCancel={()=>setDragging(null)}>
      <div className="pg-workspace">
        <aside className="pg-panel pg-library"><h2><Search size={16}/>{t.library}</h2><label className="pg-search"><Search size={16}/><input aria-label={t.search} placeholder={locale==="es"?"océano, amor, 🌙…":"ocean, love, 🌙…"} value={query} maxLength={150} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><div className="pg-filters"><select aria-label={t.category} value={group??"all"} onChange={e=>{setGroup(e.target.value==="all"?null:Number(e.target.value));setPage(0);}}><option value="all">{t.all}</option>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c[locale]}</option>)}</select><select aria-label={t.sort} value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="relevance">{t.relevance}</option><option value="alphabetical">{t.alphabetical}</option><option value="unicode">{t.unicode}</option></select></div><div className="pg-palette">{visible.map(emoji=><PaletteEmoji key={emoji.id} emoji={emoji} locale={locale} onAdd={()=>add(emoji)} disabled={board.nodes.length>=NODE_LIMIT}/>)}{!visible.length&&<p>{t.noMatches}</p>}</div><div className="pg-paging"><span>{matches.length} · {currentPage+1}/{pages}</span><div><button aria-label={t.previous} disabled={currentPage===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={17}/></button><button aria-label={t.next} disabled={currentPage===pages-1} onClick={()=>setPage(p=>p+1)}><ChevronRight size={17}/></button></div></div></aside>
        <div className="pg-canvas-column"><div className="pg-canvas-toolbar"><span>{board.nodes.length}/{NODE_LIMIT}</span><div><button aria-label={t.undo} title={t.undo} disabled={!history.past.length} onClick={()=>dispatch({type:"undo"})}><Undo2 size={17}/></button><button aria-label={t.redo} title={t.redo} disabled={!history.future.length} onClick={()=>dispatch({type:"redo"})}><Redo2 size={17}/></button><button aria-label={t.clear} title={t.clearHint} disabled={!board.nodes.length} onClick={()=>{dispatch({type:"replace",board:emptyComposition()});setSelectedId(null);}}><Trash2 size={16}/></button></div></div>
          <div role="region" aria-label={t.canvas}><Board boardRef={boardRef}><svg className="pg-edges" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="pg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a68cf4"/></marker></defs>{board.edges.map(e=>{const a=board.nodes.find(n=>n.id===e.source)!,b=board.nodes.find(n=>n.id===e.target)!;return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b9a4e0" strokeWidth=".35" markerEnd="url(#pg-arrow)"/>;})}</svg>
          {!board.nodes.length&&<div className="pg-empty"><span>🌱</span><h2>{t.empty}</h2><p>{t.emptyHint}</p></div>}
          {board.nodes.map(node=><PlacedEmoji key={node.id} node={node} locale={locale} selected={selectedId===node.id} onSelect={()=>setSelectedId(node.id)} onUpdate={patch=>dispatch({type:"update",id:node.id,patch})} onRemove={()=>dispatch({type:"remove",id:node.id})}/>)}</Board></div>
          <p className="pg-hint">{t.hint}</p><p className={`pg-save ${saveStatus==="failed"?"error":""}`} role="status">{readFailed?t.readFailed:saveStatus==="saving"?t.saving:saveStatus==="failed"?t.failed:t.saved}</p>
          <div className="pg-panel pg-inspector"><h2>{t.inspector}</h2>{selected?<><div className="pg-selected"><span>{selected.glyph}</span><p>{selected.label}</p><button aria-label={t.duplicate} title={t.duplicate} disabled={board.nodes.length>=NODE_LIMIT} onClick={()=>{const node={...selected,id:crypto.randomUUID(),x:clamp(selected.x+5),y:clamp(selected.y+5)};dispatch({type:"add",node});setSelectedId(node.id);}}><Copy size={16}/></button><button aria-label={t.remove} title={t.remove} onClick={()=>dispatch({type:"remove",id:selected.id})}><Trash2 size={16}/></button></div><div className="pg-inspector-fields"><MeaningField key={selected.id} label={t.meaning} value={selected.meaning} onCommit={meaning=>dispatch({type:"update",id:selected.id,patch:{meaning}})}/><label>{t.role}<select aria-label={t.role} value={selected.role} onChange={e=>dispatch({type:"update",id:selected.id,patch:{role:e.target.value as BoardNode["role"]}})}><option value="subject">{t.subject}</option><option value="setting">{t.setting}</option><option value="mood">{t.mood}</option></select></label>{!!emojiById.get(selected.emojiId)?.variants.length&&<label>{t.variant}<select aria-label={t.variant} value={selected.glyph} onChange={e=>dispatch({type:"update",id:selected.id,patch:{glyph:e.target.value}})}><option value={emojiById.get(selected.emojiId)!.glyph}>{emojiById.get(selected.emojiId)!.glyph}</option>{emojiById.get(selected.emojiId)!.variants.map(v=><option value={v.glyph} key={v.id}>{v.glyph}</option>)}</select></label>}<label className="pg-note">{t.note}<input aria-label={t.note} maxLength={500} value={selected.note} onChange={e=>dispatch({type:"update",id:selected.id,patch:{note:e.target.value}})}/></label></div>
          {board.nodes.length>1&&<form className="pg-connect" onSubmit={e=>{e.preventDefault();if(target&&relation.trim()&&target!==selected.id){dispatch({type:"edge",edge:{id:crypto.randomUUID(),source:selected.id,target,label:relation.trim()}});setRelation("");}}}><select aria-label={t.target} value={target===selected.id?"":target} onChange={e=>setTarget(e.target.value)}><option value="">{t.target}…</option>{board.nodes.filter(n=>n.id!==selected.id).map((n,i)=><option key={n.id} value={n.id}>{n.glyph} {n.meaning} ({i+1})</option>)}</select><input aria-label={t.relationship} maxLength={80} placeholder={t.relationPlaceholder} value={relation} onChange={e=>setRelation(e.target.value)}/><button type="submit" disabled={!board.nodes.some(n=>n.id===target&&n.id!==selected.id)||!relation.trim()}><Plus size={15}/>{t.connect}</button></form>}</>:<p>{t.select}</p>}
          {!!board.edges.length&&<div className="pg-relationships"><h3>{t.connections}</h3>{board.edges.map(e=><div key={e.id}><span>{board.nodes.find(n=>n.id===e.source)?.glyph} {e.label} → {board.nodes.find(n=>n.id===e.target)?.glyph}</span><button aria-label={`${t.remove} ${e.label}`} onClick={()=>dispatch({type:"removeEdge",id:e.id})}><X size={14}/></button></div>)}</div>}</div>
        </div>
        <aside className="pg-meaning-column"><div className="pg-panel pg-meaning"><h2><Sparkles size={16}/>{t.meaningTitle}</h2><p>{t.meaningHint}</p><label>{t.intent}<textarea aria-label={t.intent} placeholder={t.intentPlaceholder} rows={2} maxLength={1000} value={board.intent} onChange={e=>dispatch({type:"fields",patch:{intent:e.target.value}})}/></label><label>{t.interpretation}<textarea aria-label={t.interpretation} rows={7} maxLength={4000} placeholder={t.noMeaning} value={displayBrief.interpretation} disabled={!board.nodes.length} onChange={e=>dispatch({type:"fields",patch:{interpretation:e.target.value}})}/></label>{board.interpretation&&<button className="pg-link" onClick={()=>dispatch({type:"fields",patch:{interpretation:""}})}>{t.reset}</button>}<button className="pg-secondary" disabled={!board.nodes.length} onClick={()=>void copy(displayBrief.interpretation)}><Copy size={15}/>{t.copy}</button></div>
          <div className="pg-panel pg-generation"><h2><Sparkles size={16}/>{t.create}</h2><div className="pg-settings"><label>{t.output}<select aria-label={t.output} value={kind} onChange={e=>setKind(e.target.value as OutputKind)}>{outputKinds.map(k=><option key={k} value={k}>{outputNames[k]}</option>)}</select></label><label>{t.language}<select aria-label={t.language} value={outputLocale} onChange={e=>setOutputLocale(e.target.value as Locale)}><option value="en">English</option><option value="es">Español</option></select></label></div><label>{t.tone}<input aria-label={t.tone} value={tone} maxLength={120} placeholder={playgroundLabels[outputLocale].toneDefault} onChange={e=>setTone(e.target.value)}/></label><label>{t.model}<select aria-label={t.model} value={model} onChange={e=>setModel(e.target.value)}>{config?.models.map(m=><option value={m} key={m}>{m}</option>)}</select></label><label>{t.reasoning}<select aria-label={t.reasoning} value={reasoningEffort} onChange={e=>setReasoningEffort(e.target.value as ReasoningEffort)}>{reasoningEfforts.map(effort=><option value={effort} key={effort}>{effortNames[effort]}</option>)}</select></label><p>{t.reasoningHint}</p>
          <p className="pg-connection">{configFailed?t.checkFailed:!config?t.checking:config.configured?t.connected:t.setup}</p>{(!config||!config.configured)&&<button className="pg-link" onClick={()=>void checkConnection()}>{t.check}</button>}<p>{t.cap.replace("{tokens}",String(config?.maxOutputTokens||8192))}</p><button className="primary-button pg-generate" disabled={busy||!board.nodes.length||!config?.configured||!model} onClick={()=>void generate()}><Sparkles size={16}/>{busy?t.generating:t.generate}</button>{latestRun&&<div className="pg-generation-status" role="status" aria-live="polite"><p>{busy?t.generating:latestRun.status==="succeeded"?t.generated:latestRun.status==="running"?t.generating:`${t.failedRun}: ${latestRun.error||t.unknown}`}</p><button className="pg-link" onClick={()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"})}>{t.viewResult}</button></div>}<p>{t.sending}</p><p>{t.mediaHint}</p><button className="pg-link" disabled={!board.nodes.length} onClick={()=>void copy(displayBrief.interpretation)}>{t.localMessage}</button></div>
        </aside>
      </div><DragOverlay dropAnimation={null}>{dragGlyph&&<span className="pg-drag-glyph">{dragGlyph}</span>}</DragOverlay>
    </DndContext>
    {!!runs.length&&<section ref={resultsRef} className="pg-results"><h2>{t.result}</h2><p className="pg-hint">{t.runsHint}</p><div className="pg-result-list">{runs.map(run=><article className="pg-panel pg-result" key={run.id}><div className="pg-result-heading"><h3>{outputNames[run.settings.kind]}</h3><span>{new Date(run.createdAt).toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit"})} · {run.result?.model||run.settings.model}{run.settings.reasoningEffort&&run.settings.reasoningEffort!=="default"?` · ${effortNames[run.settings.reasoningEffort]}`:""}</span></div>{run.identity!==semanticIdentity(board,run.settings.locale)&&<p className="pg-stale">{t.stale}</p>}{run.status==="running"?<p role="status">{t.generating}</p>:run.result?<><textarea aria-label={t.outputEdit} value={run.result.text} rows={7} maxLength={16000} onChange={e=>setRuns(current=>current.map(r=>r.id===run.id&&r.result?{...r,result:{...r.result,text:e.target.value}}:r))}/><button className="pg-secondary" onClick={()=>void copy(run.result!.text)}><Copy size={14}/>{t.copyOutput}</button>{run.result.usage&&<p className="pg-hint">{run.result.usage.promptTokens} input / {run.result.usage.completionTokens} output tokens{run.result.usage.cost!==undefined?` · $${run.result.usage.cost.toFixed(6)}`:""}</p>}</>:<p role="status" className="pg-stale">{run.error}</p>}<details><summary>{t.snapshot}</summary><pre>{run.brief.interpretation}</pre></details></article>)}</div></section>}
  </section>;
}

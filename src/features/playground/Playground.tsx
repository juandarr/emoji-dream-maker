"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Copy, Feather, Plus, Redo2, RotateCcw, Search, Trash2, Undo2, X } from "lucide-react";
import { categories, emojiById, searchCatalog } from "@/lib/catalog";
import type { EmojiRecord, Locale } from "@/lib/types";
import { boardReducer, clamp, compileBrief, createNode, emptyComposition, NODE_LIMIT, parseComposition, semanticIdentity, type BoardNode } from "./model";
import { loadWorkspace, saveWorkspace, SAVED_RUN_LIMIT, type Workspace } from "./storage";
import { playgroundLabels } from "./labels";
import EmojiArtwork from "./emoji-artwork";
import Canvas, {type CanvasGeometry} from "./Canvas";
import {worldPoint} from "./camera";
import { creationTitle, type ReasoningEffort, type GenerationRun, type GenerationSettings, type OutputKind } from "@/features/generation/model";

import { ReadingButton, StoryContent, StoryModal, StoryPage, StoryShelf, StorySymbols, storyLabels } from "./StoryResults";
import "./playground-story.css";
import CreationHeader, { type GenerationConfig } from "./CreationHeader";

type Seed={id:string;emoji:EmojiRecord;glyph:string};

function PaletteEmoji({emoji,locale,onAdd,disabled}:{emoji:EmojiRecord;locale:Locale;onAdd:()=>void;disabled:boolean}) {
  const {setNodeRef,attributes,listeners,isDragging}=useDraggable({id:`tray:${emoji.id}`,disabled});
  const t=playgroundLabels[locale];
  return <button ref={setNodeRef} {...attributes} {...listeners} disabled={disabled} onClick={onAdd} aria-label={`${t.add} ${emoji.labels[locale]}`} title={emoji.labels[locale]} className={`pg-palette-emoji ${isDragging?"dragging":""}`}><span><EmojiArtwork glyph={emoji.glyph}/></span><small>{emoji.labels[locale]}</small></button>;
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
  const t=playgroundLabels[locale], s=storyLabels[locale];
  const [readingId,setReadingId]=useState<string|null>(null);
  const [activeRunId,setActiveRunId]=useState<string|null>(null),[resetVersion,setResetVersion]=useState(0);
  const [deletedRun,setDeletedRun]=useState<{run:GenerationRun;wasActive:boolean}|null>(null);
  const [history,dispatch]=useReducer(boardReducer,{past:[],present:emptyComposition(),future:[]});
  const board=history.present;
  const [ready,setReady]=useState(false),[readFailed,setReadFailed]=useState(false),[saveStatus,setSaveStatus]=useState<"saved"|"saving"|"failed">("saved");
  const [selectedIds,setSelectedIds]=useState<string[]>([]),[query,setQuery]=useState(""),[group,setGroup]=useState<number|null>(null),[sort,setSort]=useState("relevance"),[page,setPage]=useState(0);
  const [target,setTarget]=useState(""),[relation,setRelation]=useState(""),[dragging,setDragging]=useState<string|null>(null),[notice,setNotice]=useState("");
  const [runs,setRuns]=useState<GenerationRun[]>([]),[busy,setBusy]=useState(false),[config,setConfig]=useState<GenerationConfig|null>(null),[configFailed,setConfigFailed]=useState(false);
  const [reasoningEffort,setReasoningEffort]=useState<ReasoningEffort>("default"),[pendingResultId,setPendingResultId]=useState<string|null>(null);
  const [pickerOpen,setPickerOpen]=useState(false);
  const geometryRef=useRef<CanvasGeometry>({camera:{x:0,y:0,zoom:1},width:600,height:500});
  const resultsRef=useRef<HTMLElement|null>(null);
  const [kind,setKind]=useState<OutputKind>("interpretation"),[model,setModel]=useState("");
  const boardRef=useRef<HTMLDivElement|null>(null),fileRef=useRef<HTMLInputElement|null>(null),consumedSeed=useRef(""),saveQueue=useRef<Promise<void>>(Promise.resolve()),saveVersion=useRef(0),busyRef=useRef(false);
  const sensors=useSensors(useSensor(MouseSensor,{activationConstraint:{distance:6}}),useSensor(TouchSensor,{activationConstraint:{delay:200,tolerance:8}}),useSensor(KeyboardSensor));
  const persist=useCallback((workspace:Workspace)=>{
    const version=++saveVersion.current;setSaveStatus("saving");
    const save=saveQueue.current.catch(()=>{}).then(()=>saveWorkspace(workspace));
    saveQueue.current=save;
    void save.then(()=>{if(version===saveVersion.current)setSaveStatus("saved");},()=>{if(version===saveVersion.current)setSaveStatus("failed");});
    return save;
  },[]);
  useEffect(()=>{let alive=true;void loadWorkspace().then(saved=>{if(alive&&saved){dispatch({type:"load",board:saved.board});setRuns(saved.runs);setActiveRunId(saved.activeRunId??null);}},()=>{if(alive)setReadFailed(true);}).finally(()=>{if(alive)setReady(true);});return()=>{alive=false;};},[]);
  useEffect(()=>{if(ready&&!readFailed)void persist({board,runs,activeRunId}).catch(()=>{});},[ready,readFailed,board,runs,activeRunId,persist]);
  const checkConnection=useCallback(async()=>{
    setConfig(null);setConfigFailed(false);
    try {const response=await fetch("/api/generations",{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error();const next:GenerationConfig=await response.json();if(!Array.isArray(next.models))throw new Error();setConfig(next);setReasoningEffort(next.reasoningEffort||"default");setModel(current=>next.models.includes(current)?current:next.models[0]||"");}
    catch {setConfigFailed(true);}
  },[]);
  useEffect(()=>{void checkConnection();},[checkConnection]);
  useEffect(()=>{
    if(!pendingResultId || !runs.some(r=>r.id===pendingResultId&&r.status!=="running"))return;
    if(resultsRef.current?.getClientRects().length)resultsRef.current.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    setPendingResultId(null);
  },[runs,pendingResultId]);
  useEffect(()=>{
    const deselect=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!document.querySelector("dialog[open]")){setSelectedIds([]);setPickerOpen(false);}};
    window.addEventListener("keydown",deselect);return()=>window.removeEventListener("keydown",deselect);
  },[]);
  const add=useCallback((emoji:EmojiRecord,position?:{x:number;y:number},glyph?:string)=>{
    if(board.nodes.length>=NODE_LIMIT){setNotice(t.limit);return;}
    const rect=boardRef.current?.getBoundingClientRect(),geometry=geometryRef.current;
    const center=rect?worldPoint({x:rect.width/2+(board.nodes.length%3-1)*48,y:rect.height/2+(Math.floor(board.nodes.length/3)%3-1)*48},geometry.camera):null;
    const placement=position||(center?{x:center.x/geometry.width*100,y:center.y/geometry.height*100}:undefined);
    const node=createNode(emoji,locale,crypto.randomUUID(),board.nodes.length,placement,glyph);dispatch({type:"add",node});setSelectedIds([]);
  },[board.nodes.length,locale,t.limit]);
  useEffect(()=>{if(ready&&seed&&consumedSeed.current!==seed.id){consumedSeed.current=seed.id;add(seed.emoji,undefined,seed.glyph);}},[ready,seed,add]);
  const matches=useMemo(()=>{
    const result=searchCatalog(query,group);
    if(sort==="alphabetical")result.sort((a,b)=>a.labels[locale].localeCompare(b.labels[locale],locale));
    if(sort==="unicode")result.sort((a,b)=>a.order-b.order);
    return result;
  },[query,group,sort,locale]);
  const pages=Math.max(1,Math.ceil(matches.length/30)),currentPage=Math.min(page,pages-1),visible=matches.slice(currentPage*30,(currentPage+1)*30);
  const selectedNodes=board.nodes.filter(n=>selectedIds.includes(n.id));
  const selected=selectedNodes.length===1?selectedNodes[0]:undefined;
  const displayBrief=compileBrief(board,locale);
  function endDrag(event:DragEndEvent) {
    setDragging(null);const rect=boardRef.current?.getBoundingClientRect();if(!rect)return;
    const id=String(event.active.id);
    if(id.startsWith("tray:")&&event.over?.id==="composition-board"){
      const emoji=emojiById.get(id.slice(5)),translated=event.active.rect.current.translated;
      if(emoji&&translated){const geometry=geometryRef.current;const start=event.activatorEvent;const origin=start instanceof MouseEvent?start:"touches" in start?(start as TouchEvent).touches[0]:null;const drop=origin?{x:origin.clientX+event.delta.x,y:origin.clientY+event.delta.y}:{x:translated.left+translated.width/2,y:translated.top+translated.height/2};const point=worldPoint({x:drop.x-rect.left,y:drop.y-rect.top},geometry.camera);add(emoji,{x:point.x/geometry.width*100,y:point.y/geometry.height*100});}
    }
  }
  async function copy(text:string) {try{await navigator.clipboard.writeText(text);setNotice(t.copied);return true;}catch{setNotice(t.copyFailed);return false;}}
  async function importBoard(file:File) {
    try {if(file.size>512000)throw new Error();const next=parseComposition(JSON.parse(await file.text()));dispatch({type:"replace",board:next});setSelectedIds([]);setReadFailed(false);setNotice("");}
    catch {setNotice(t.importError);}
  }
  async function generate() {
    if(busyRef.current||!board.nodes.length||!config?.configured)return;
    busyRef.current=true;setBusy(true);
    const settings:GenerationSettings={kind,locale,tone:t.toneDefault,model,reasoningEffort};
    const run:GenerationRun={id:crypto.randomUUID(),createdAt:Date.now(),identity:semanticIdentity(board,locale),board:structuredClone(board),brief:compileBrief(board,locale),settings,status:"running"};
    const next=[run,...runs].slice(0,SAVED_RUN_LIMIT);setRuns(next);setActiveRunId(run.id);setPendingResultId(run.id);
    // Persist the immutable input before the deliberate submission. No automatic retries.
    if(!readFailed)await persist({board,runs:next,activeRunId:run.id}).catch(()=>{});
    try {
      const response=await fetch("/api/generations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:run.id,board:run.board,settings}),signal:AbortSignal.timeout(135000)});
      const data=await response.json();
      finishRun(response.ok&&data.result?{...run,status:"succeeded",result:data.result}:{...run,status:data.code==="unknown"?"unknown":"failed",error:data.error||t.failedRun});
    } catch {finishRun({...run,status:"unknown",error:t.unknown});}
    finally {busyRef.current=false;setBusy(false);}
  }
  function finishRun(finished:GenerationRun) {
    setRuns(current=>current.map(run=>run.id===finished.id?finished:run));
    // A deleted pending creation stays deleted; Undo still restores its completed response.
    setDeletedRun(current=>current?.run.id===finished.id?{...current,run:finished}:current);
  }
  function resetCanvas() {
    dispatch({type:"replace",board:emptyComposition()});setSelectedIds([]);setPickerOpen(false);
    setActiveRunId(null);setReadingId(null);setPendingResultId(null);setTarget("");setRelation("");setNotice("");
    setResetVersion(version=>version+1);
  }
  function deleteResult(id:string) {
    const run=runs.find(run=>run.id===id);if(!run)return;
    setDeletedRun({run,wasActive:id===activeRunId});setRuns(current=>current.filter(run=>run.id!==id));
    if(id===activeRunId)setActiveRunId(null);
    if(id===readingId)setReadingId(null);
    if(id===pendingResultId)setPendingResultId(null);
  }
  function undoDelete() {
    if(!deletedRun)return;
    setRuns(current=>[deletedRun.run,...current.filter(run=>run.id!==deletedRun.run.id)].sort((a,b)=>b.createdAt-a.createdAt).slice(0,SAVED_RUN_LIMIT));
    if(deletedRun.wasActive&&!activeRunId)setActiveRunId(deletedRun.run.id);
    setDeletedRun(null);
  }
  // Canvas nodes move directly; the tray needs a preview to cross its scroll boundary.
  const dragGlyph=dragging?.startsWith("tray:")?emojiById.get(dragging.slice(5))?.glyph:undefined;
  const latestRun=runs.find(run=>run.id===activeRunId), readingRun=runs.find(run=>run.id===readingId);
  function editResult(id:string,text:string) {setRuns(current=>current.map(run=>run.id===id&&run.result?{...run,result:{...run.result,text}}:run));}
  function resultContent(run:GenerationRun) {return <StoryContent key={run.id} run={run} locale={locale} outputName={outputNames[run.settings.kind]} stale={run.identity!==semanticIdentity(board,run.settings.locale)} onEdit={text=>editResult(run.id,text)} onCopy={text=>copy(text)}/>;}
  const outputNames:Record<OutputKind,string>={interpretation:t.interpretOutput,message:t.message,poem:t.poem,story:t.story,lyrics:t.lyrics,"image-prompt":t.imagePrompt,storyboard:t.storyboard};
  const inspector=<div className="pg-panel pg-inspector"><h2>{t.inspector}</h2>{selected?<><div className="pg-selected"><span><EmojiArtwork glyph={selected.glyph}/></span><p>{selected.label}</p><button aria-label={t.duplicate} title={t.duplicate} disabled={board.nodes.length>=NODE_LIMIT} onClick={()=>{const node={...selected,id:crypto.randomUUID(),x:clamp(selected.x+5),y:clamp(selected.y+5)};dispatch({type:"add",node});setSelectedIds([node.id]);}}><Copy size={16}/></button><button aria-label={t.remove} title={t.remove} onClick={()=>dispatch({type:"remove",id:selected.id})}><Trash2 size={16}/></button></div><div className="pg-inspector-fields"><MeaningField key={selected.id} label={t.meaning} value={selected.meaning} onCommit={meaning=>dispatch({type:"update",id:selected.id,patch:{meaning}})}/><label>{t.role}<select aria-label={t.role} value={selected.role} onChange={e=>dispatch({type:"update",id:selected.id,patch:{role:e.target.value as BoardNode["role"]}})}><option value="subject">{t.subject}</option><option value="setting">{t.setting}</option><option value="mood">{t.mood}</option></select></label>{!!emojiById.get(selected.emojiId)?.variants.length&&<label>{t.variant}<select aria-label={t.variant} value={selected.glyph} onChange={e=>dispatch({type:"update",id:selected.id,patch:{glyph:e.target.value}})}><option value={emojiById.get(selected.emojiId)!.glyph}>{emojiById.get(selected.emojiId)!.glyph}</option>{emojiById.get(selected.emojiId)!.variants.map(v=><option value={v.glyph} key={v.id}>{v.glyph}</option>)}</select></label>}<label className="pg-note">{t.note}<input aria-label={t.note} maxLength={500} value={selected.note} onChange={e=>dispatch({type:"update",id:selected.id,patch:{note:e.target.value}})}/></label></div>
          {board.nodes.length>1&&<form className="pg-connect" onSubmit={e=>{e.preventDefault();if(target&&relation.trim()&&target!==selected.id){dispatch({type:"edge",edge:{id:crypto.randomUUID(),source:selected.id,target,label:relation.trim()}});setRelation("");}}}><select aria-label={t.target} value={target===selected.id?"":target} onChange={e=>setTarget(e.target.value)}><option value="">{t.target}…</option>{board.nodes.filter(n=>n.id!==selected.id).map((n,i)=><option key={n.id} value={n.id}>{n.glyph} {n.meaning} ({i+1})</option>)}</select><input aria-label={t.relationship} maxLength={80} placeholder={t.relationPlaceholder} value={relation} onChange={e=>setRelation(e.target.value)}/><button type="submit" disabled={!board.nodes.some(n=>n.id===target&&n.id!==selected.id)||!relation.trim()}><Plus size={15}/>{t.connect}</button></form>}</>:selectedNodes.length>1?<div className="pg-group-inspector"><p>{t.groupSelected.replace("{count}",String(selectedNodes.length))}</p><p>{t.groupHint}</p><button className="pg-secondary" onClick={()=>{dispatch({type:"removeMany",ids:selectedNodes.map(n=>n.id)});setSelectedIds([]);}}><Trash2 size={15}/>{t.deleteGroup}</button></div>:<p>{t.select}</p>}
          {!!board.edges.length&&<div className="pg-relationships"><h3>{t.connections}</h3>{board.edges.map(e=><div key={e.id}><span>{board.nodes.find(n=>n.id===e.source)?.glyph} {e.label} → {board.nodes.find(n=>n.id===e.target)?.glyph}</span><button aria-label={`${t.remove} ${e.label}`} onClick={()=>dispatch({type:"removeEdge",id:e.id})}><X size={14}/></button></div>)}</div>}</div>;
  if(!ready)return <div className="pg-loading" role="status">{t.loading}</div>;
  return <section className={`playground ${dragging?"is-dragging":""}`} aria-label={t.name}>
    {(notice||readFailed)&&<div className="storage-notice" role="status"><span>{readFailed?t.readFailed:notice}</span>{readFailed?<button onClick={()=>{dispatch({type:"replace",board:emptyComposition()});setReadFailed(false);}}>{t.fresh}</button>:<button aria-label="Close notice" onClick={()=>setNotice("")}><X size={16}/></button>}</div>}
    <CreationHeader
      locale={locale} board={board} interpretation={displayBrief.interpretation}
      kind={kind} onKind={setKind} outputNames={outputNames}
      model={model} onModel={setModel} reasoningEffort={reasoningEffort} onReasoning={setReasoningEffort}
      config={config} configFailed={configFailed} onCheck={()=>void checkConnection()}
      busy={busy} status={busy?t.generating:latestRun?.status==="succeeded"?t.generated:""}
      error={latestRun&&(latestRun.status==="failed"||latestRun.status==="unknown")?`${t.failedRun}: ${latestRun.error||t.unknown}`:undefined}
      onGenerate={()=>void generate()} onFields={patch=>dispatch({type:"fields",patch})}
      onCopy={()=>void copy(displayBrief.interpretation)} onExport={()=>download(board,"emoji-playground.json")} onImport={()=>fileRef.current?.click()}
      inspector={inspector}
    />
    <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e=>{const file=e.target.files?.[0];if(file)void importBoard(file);e.target.value="";}}/>
    <DndContext id="playground-editor" sensors={sensors} autoScroll={false} onDragStart={e=>{setDragging(String(e.active.id));}} onDragEnd={endDrag} onDragCancel={()=>setDragging(null)}>
      <div className="pg-workspace">
        <div className="pg-canvas-column"><Canvas resetVersion={resetVersion} board={board} locale={locale} selectedIds={selectedNodes.map(n=>n.id)} onSelect={setSelectedIds} onTransform={nodes=>dispatch({type:"transform",updates:nodes.map(({id,x,y,scale,rotation})=>({id,patch:{x,y,scale,rotation}}))})} onRemove={ids=>{dispatch({type:"removeMany",ids});setSelectedIds([]);}} onAdd={()=>setPickerOpen(true)} boardRef={boardRef} geometryRef={geometryRef} pickerOpen={pickerOpen} trayDragging={!!dragging} setPickerOpen={setPickerOpen} overlay={<DragOverlay dropAnimation={null}>{dragGlyph&&<span className="pg-drag-glyph"><EmojiArtwork glyph={dragGlyph}/></span>}</DragOverlay>} toolbar={<div className="pg-canvas-toolbar"><span>{board.nodes.length}/{NODE_LIMIT}</span><div><button aria-label={t.undo} title={t.undo} disabled={!history.past.length} onClick={()=>dispatch({type:"undo"})}><Undo2 size={17}/></button><button aria-label={t.redo} title={t.redo} disabled={!history.future.length} onClick={()=>dispatch({type:"redo"})}><Redo2 size={17}/></button><button aria-label={t.clear} title={t.clearHint} onClick={resetCanvas}><RotateCcw size={16}/></button></div></div>} picker={<><label className="pg-search"><Search size={16}/><input aria-label={t.search} placeholder={locale==="es"?"océano, amor, 🌙…":"ocean, love, 🌙…"} value={query} maxLength={150} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label><div className="pg-filters"><select aria-label={t.category} value={group??"all"} onChange={e=>{setGroup(e.target.value==="all"?null:Number(e.target.value));setPage(0);}}><option value="all">{t.all}</option>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c[locale]}</option>)}</select><select aria-label={t.sort} value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="relevance">{t.relevance}</option><option value="alphabetical">{t.alphabetical}</option><option value="unicode">{t.unicode}</option></select></div><div className="pg-palette">{visible.map(emoji=><PaletteEmoji key={emoji.id} emoji={emoji} locale={locale} onAdd={()=>add(emoji)} disabled={board.nodes.length>=NODE_LIMIT}/>)}{!visible.length&&<p>{t.noMatches}</p>}</div><div className="pg-paging"><span>{matches.length} · {currentPage+1}/{pages}</span><div><button aria-label={t.previous} disabled={currentPage===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={17}/></button><button aria-label={t.next} disabled={currentPage===pages-1} onClick={()=>setPage(p=>p+1)}><ChevronRight size={17}/></button></div></div></>}/>
          <p className="pg-hint">{t.hint}</p><p className={`pg-save ${saveStatus==="failed"?"error":""}`} role="status">{readFailed?t.readFailed:saveStatus==="saving"?t.saving:saveStatus==="failed"?t.failed:t.saved}</p>

        </div>
        <aside ref={resultsRef} className="pg-output" aria-label={t.result}>
          {latestRun&&<ReadingButton locale={locale} onClick={()=>setReadingId(latestRun.id)}/>}
          {latestRun?resultContent(latestRun):<StoryPage><span className="pg-story-kicker">{s.chapter}</span><StorySymbols nodes={board.nodes} locale={locale}/><h3 className="pg-story-title">{s.blank}</h3><div className="pg-story-divider" aria-hidden="true"><span>✧</span></div><p className="pg-story-invitation">{s.blankHint}</p><Feather className="pg-story-feather" size={36}/><span className="pg-story-end" aria-hidden="true">❧</span></StoryPage>}
        </aside>
      </div>
    </DndContext>
    <StoryShelf runs={runs} locale={locale} outputNames={outputNames} onOpen={setReadingId} onDelete={deleteResult} onUndo={undoDelete} deletedTitle={deletedRun?(creationTitle(deletedRun.run)||outputNames[deletedRun.run.settings.kind]):undefined}/>
    {readingRun&&<StoryModal title={creationTitle(readingRun)||outputNames[readingRun.settings.kind]} locale={locale} onClose={()=>setReadingId(null)}>{resultContent(readingRun)}</StoryModal>}
  </section>;
}

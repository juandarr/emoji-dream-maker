"use client";

import { useAccount } from "@/features/account/AccountWorkspace";
import type { UndoReceipt } from "@/features/account/creation-repository";
import { AccountRequestError, readResponse } from "@/features/account/client";
import { useNotification } from "@/hooks/use-notification";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Bookmark, BookmarkCheck, Copy, Feather, History, Plus, Redo2, RotateCcw, SlidersHorizontal, Trash2, Undo2, X } from "lucide-react";
import { emojiById } from "@/lib/catalog";
import type { EmojiRecord, Locale } from "@/lib/types";
import { boardReducer, clamp, compileBrief, createNode, emptyComposition, NODE_LIMIT, semanticIdentity, type BoardNode } from "./model";
import { CreationConflict } from "./creation-repository";
import { useCreations } from "./use-creations";
import { canSaveState, containsWork, groupCreations, isStateSaved, makeState, resultMatches, restoreState, saveableState, type Collection, type CreationRecord, type CreationState, type RestoreParts } from "./creations";
import { creationLabels } from "./creation-labels";
import { CreationDetail, CreationDialog, SavedCreations, TemporaryCreations } from "./CreationHistory";
import { playgroundLabels } from "./labels";
import { nodeLabel, nodeMeaning } from "./localization";
import { generationErrorMessage } from "@/features/generation/messages";
import { dragAccessibility } from "@/lib/drag-accessibility";
import EmojiArtwork from "./emoji-artwork";
import Canvas, {type CanvasGeometry} from "./Canvas";
import {worldPoint,type Point} from "./camera";
import ToolbarTooltip from "./ToolbarTooltip";
import EmojiPicker, {initialPickerState} from "./EmojiPicker";
import {copySelection,readSelection,pasteSelection,type SelectionClipboard} from "./clipboard";
import {selectionBounds} from "./transforms";
import { creationTitle, type ReasoningEffort, type GenerationRun, type GenerationSettings, type OutputKind } from "@/features/generation/model";

import { ReadingButton, StoryContent, StoryModal, StoryPage, StorySymbols, storyLabels } from "./StoryResults";
import "./playground-story.css";
import "./playground-editor.css";
import CreationHeader, { type GenerationConfig } from "./CreationHeader";

type Seed={id:string;emoji:EmojiRecord;glyph:string};

function MeaningField({value,onCommit,label}:{value:string;onCommit:(v:string)=>void;label:string}) {
  const [draft,setDraft]=useState(value);
  useEffect(()=>setDraft(value),[value]);
  return <label>{label}<input aria-label={label} value={draft} maxLength={150} onChange={e=>setDraft(e.target.value)} onBlur={()=>{const next=draft.trim()||value;setDraft(next);if(next!==value)onCommit(next);}} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/></label>;
}
export default function Playground({locale,seed,view="editor",onEdit,onSavedCount}:{locale:Locale;seed:Seed|null;view?:"editor"|"creations";onEdit?:()=>void;onSavedCount?:(count:number)=>void}) {
  const t=playgroundLabels[locale], s=storyLabels[locale], c=creationLabels[locale];
  const account=useAccount();
  const data=useCreations();const {ready}=data;
  const dataRef=useRef(data);dataRef.current=data;
  const [readNotice,setReadNotice]=useNotification(false),[generationNotice,setGenerationNotice]=useNotification(false);
  useEffect(()=>{setReadNotice(data.error);},[data.error,setReadNotice]);
  const [readingRun,setReadingRun]=useState<GenerationRun|null>(null),[activeRun,setActiveRun]=useState<GenerationRun|null>(null),[resetVersion,setResetVersion]=useState(0),[fitVersion,setFitVersion]=useState(0);
  const [preview,setPreview]=useState<CreationState|null>(null),[pendingReplacement,setPendingReplacement]=useState<(()=>void)|null>(null),[replacementFailed,setReplacementFailed]=useState(false);
  const [pendingRemoval,setPendingRemoval]=useState<{collection:Collection;records:CreationRecord[]}|null>(null),[removalError,setRemovalError]=useState(""),[deleted,setDeleted]=useNotification<{collection:Collection;records:CreationRecord[];receipt:UndoReceipt}|null>(null);
  const [configurationChosen,setConfigurationChosen]=useState(false);const configurationEdited=useRef(false);
  const activeCheckpoint=useRef<CreationRecord|null>(null),editTimer=useRef<ReturnType<typeof setTimeout>|null>(null),editVersion=useRef(0);
  const [editingPending,setEditingPending]=useState(false);
  const [writeFailure,setWriteFailure]=useState<{message:string;retry:()=>Promise<unknown>;conflict?:boolean}|null>(null);
  const editQueue=useRef<Promise<unknown>>(Promise.resolve());
  type Job={run:GenerationRun;token:string;controller:AbortController;row?:CreationRecord;canceled:boolean;finished:boolean;persistencePending?:boolean};
  const jobRef=useRef<Job|null>(null);
  const [history,dispatch]=useReducer(boardReducer,{past:[],present:emptyComposition(),future:[]});
  const board=history.present;
  const [selectedIds,setSelectedIds]=useState<string[]>([]);
  const [pickerState,setPickerState]=useState(initialPickerState);
  const [target,setTarget]=useState(""),[relation,setRelation]=useState(""),[dragging,setDragging]=useState<string|null>(null),[notice,setNotice]=useNotification("");
  const [busy,setBusy]=useState(false),[config,setConfig]=useState<GenerationConfig|null>(null),[configFailed,setConfigFailed]=useState(false);
  const [reasoningEffort,setReasoningEffort]=useState<ReasoningEffort>(account.playground?.reasoningEffort||"default"),[pendingResultId,setPendingResultId]=useState<string|null>(null);
  useEffect(()=>{setGenerationNotice(busy);},[busy,setGenerationNotice]);
  const [pickerOpen,setPickerOpen]=useState(false);
  const clipboardRef=useRef<SelectionClipboard|null>(null),pasteCount=useRef(0),cursorRef=useRef<Point|null>(null),dragPointRef=useRef<Point|null>(null);
  const [canPaste,setCanPaste]=useState(false),[canvasNotice,setCanvasNotice]=useNotification("");
  const latestBoard=useRef(board);latestBoard.current=board;
  const geometryRef=useRef<CanvasGeometry>({camera:{x:0,y:0,zoom:1},width:600,height:500});
  const resultsRef=useRef<HTMLElement|null>(null);
  const [kind,setKind]=useState<OutputKind>(account.playground?.kind||"interpretation"),[model,setModel]=useState(account.playground?.model||"");
  const [outputLocale,setOutputLocale]=useState<Locale>(account.playground?.locale||locale),[tone,setTone]=useState(account.playground?.tone||t.toneDefault);
  const boardRef=useRef<HTMLDivElement|null>(null),consumedSeed=useRef(""),busyRef=useRef(false);
  const sensors=useSensors(useSensor(MouseSensor,{activationConstraint:{distance:6}}),useSensor(TouchSensor,{activationConstraint:{delay:200,tolerance:8}}),useSensor(KeyboardSensor));
  const authoredContext=!!(board.title||board.intent||board.interpretation||board.edges.length||board.nodes.some(n=>n.customMeaning||n.note||n.role!=="subject"));
  const configurationActive=configurationChosen||authoredContext;
  const settings:GenerationSettings={kind,locale:outputLocale,tone,model,reasoningEffort};
  const currentState:CreationState={schemaVersion:1,id:"editor",createdAt:0,board,settings:configurationActive?settings:null,run:activeRun};
  const saved=isStateSaved(currentState,data.saved);
  useEffect(()=>{onSavedCount?.(groupCreations(data.saved).length);},[data.saved,onSavedCount]);
  useEffect(()=>()=>{if(editTimer.current)clearTimeout(editTimer.current);},[]);
  const checkConnection=useCallback(async()=>{
    setConfig(null);setConfigFailed(false);
    try {const response=await account.request("/api/generations",{signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error();const next:GenerationConfig=await response.json();if(!Array.isArray(next.models))throw new Error();setConfig(next);setReasoningEffort(current=>configurationEdited.current||account.playground?current:next.reasoningEffort||"default");setModel(current=>configurationEdited.current||account.playground?current:current||next.models[0]||"");}
    catch {setConfigFailed(true);}
  },[account.request]);
  useEffect(()=>{void checkConnection();},[checkConnection]);
  useEffect(()=>{
    if(!pendingResultId || !(activeRun?.id===pendingResultId&&activeRun.status!=="running"))return;
    if(resultsRef.current?.getClientRects().length)resultsRef.current.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});
    setPendingResultId(null);
  },[activeRun,pendingResultId]);
  useEffect(()=>{
    const deselect=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!document.querySelector("dialog[open]")){setSelectedIds([]);setPickerOpen(false);}};
    window.addEventListener("keydown",deselect);return()=>window.removeEventListener("keydown",deselect);
  },[]);
  useEffect(()=>{
    const track=(event:PointerEvent)=>{const point={x:event.clientX,y:event.clientY};dragPointRef.current=point;cursorRef.current=event.pointerType==="touch"?null:point;};
    const clear=()=>{cursorRef.current=null;};
    const leave=(event:PointerEvent)=>{if(!event.relatedTarget)clear();};
    document.addEventListener("pointermove",track,true);document.addEventListener("pointerdown",track,true);document.addEventListener("pointerup",track,true);document.addEventListener("pointerout",leave);window.addEventListener("blur",clear);
    return()=>{document.removeEventListener("pointermove",track,true);document.removeEventListener("pointerdown",track,true);document.removeEventListener("pointerup",track,true);document.removeEventListener("pointerout",leave);window.removeEventListener("blur",clear);};
  },[]);
  const add=useCallback((emoji:EmojiRecord,position?:{x:number;y:number},glyph?:string)=>{
    if(board.nodes.length>=NODE_LIMIT){setNotice(t.limit);return;}
    const rect=boardRef.current?.getBoundingClientRect(),geometry=geometryRef.current;
    const center=rect?worldPoint({x:rect.width/2+(board.nodes.length%3-1)*48,y:rect.height/2+(Math.floor(board.nodes.length/3)%3-1)*48},geometry.camera):null;
    const placement=position||(center?{x:center.x/geometry.width*100,y:center.y/geometry.height*100}:undefined);
    const node=createNode(emoji,locale,crypto.randomUUID(),board.nodes.length,placement,glyph);dispatch({type:"add",node});setSelectedIds([]);
  },[board.nodes.length,locale,t.limit]);
  useEffect(()=>{if(ready&&seed&&consumedSeed.current!==seed.id){consumedSeed.current=seed.id;add(seed.emoji,undefined,seed.glyph);}},[ready,seed,add]);
  const selectedNodes=board.nodes.filter(n=>selectedIds.includes(n.id));
  const selected=selectedNodes.length===1?selectedNodes[0]:undefined;
  const displayBrief=compileBrief(board,locale);
  useEffect(()=>{setNotice("");setCanvasNotice("");if(!configurationEdited.current){setOutputLocale(account.playground?.locale||locale);setTone(account.playground?.tone||playgroundLabels[locale].toneDefault);}},[locale,account.playground?.locale,account.playground?.tone]);
  function rememberSelection(){
    const g=geometryRef.current,clip=copySelection(board,selectedIds,{width:g.width,height:g.height});
    if(clip){clipboardRef.current=clip;pasteCount.current=0;setCanPaste(true);setCanvasNotice(clip.nodes.length===1?t.selectionCopiedOne:t.selectionCopied.replace("{count}",String(clip.nodes.length)));}
    return clip;
  }
  async function copyObjects(){
    const clip=rememberSelection();if(!clip)return;
    try{await navigator.clipboard.writeText(JSON.stringify(clip));}catch{setCanvasNotice(t.copyLocal);}
  }
  function insertSelection(clip:SelectionClipboard){
    const current=latestBoard.current;
    if(current.nodes.length+clip.nodes.length>NODE_LIMIT||current.edges.length+clip.edges.length>160){setCanvasNotice(t.pasteLimit);return;}
    clipboardRef.current=clip;setCanPaste(true);
    const g=geometryRef.current,rect=boardRef.current!.getBoundingClientRect(),bounds=selectionBounds(clip.nodes,clip.world)!;
    const offset=24*(pasteCount.current+1)/g.camera.zoom;
    let center={x:(bounds.left+bounds.right)/2+offset,y:(bounds.top+bounds.bottom)/2+offset};
    const half={x:(bounds.right-bounds.left)/2,y:(bounds.bottom-bounds.top)/2};
    if(g.camera.x+(center.x-half.x)*g.camera.zoom<0||g.camera.x+(center.x+half.x)*g.camera.zoom>rect.width||g.camera.y+(center.y-half.y)*g.camera.zoom<0||g.camera.y+(center.y+half.y)*g.camera.zoom>rect.height)center=worldPoint({x:rect.width/2,y:rect.height/2},g.camera);
    const cursor=cursorRef.current,underCursor=cursor?document.elementFromPoint(cursor.x,cursor.y):null;
    if(cursor&&underCursor&&boardRef.current?.contains(underCursor))center=worldPoint({x:cursor.x-rect.left,y:cursor.y-rect.top},g.camera);
    const pasted=pasteSelection(clip,{width:g.width,height:g.height},center,()=>crypto.randomUUID());
    dispatch({type:"paste",...pasted});setSelectedIds(pasted.nodes.map(n=>n.id));pasteCount.current++;
    setCanvasNotice(pasted.nodes.length===1?t.selectionPastedOne:t.selectionPasted.replace("{count}",String(pasted.nodes.length)));boardRef.current?.focus({preventScroll:true});
  }
  async function pasteObjects(){
    let clip=clipboardRef.current;
    try{const text=await navigator.clipboard.readText();clip=readSelection(text)||clip;}catch{/* Local copies remain usable when browser clipboard access is blocked. */}
    if(clip)insertSelection(clip);else setCanvasNotice(t.clipboardEmpty);
  }
  const editingClipboard=(target:EventTarget)=>target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');
  function handleCopy(event:React.ClipboardEvent){
    if(editingClipboard(event.target)||!!window.getSelection()?.toString())return;
    const clip=rememberSelection();if(!clip)return;
    event.preventDefault();event.clipboardData.setData("text/plain",JSON.stringify(clip));
  }
  function handlePaste(event:React.ClipboardEvent){
    if(editingClipboard(event.target))return;
    const text=event.clipboardData.getData("text/plain"),clip=readSelection(text)||(!text?clipboardRef.current:null);
    if(!clip)return;event.preventDefault();insertSelection(clip);
  }
  function endDrag(event:DragEndEvent) {
    setDragging(null);const rect=boardRef.current?.getBoundingClientRect();if(!rect)return;
    const id=String(event.active.id);
    if(id.startsWith("tray:")&&event.over?.id==="composition-board"){
      const emoji=emojiById.get(id.slice(5)),translated=event.active.rect.current.translated;
      if(emoji&&translated){
        const geometry=geometryRef.current,start=event.activatorEvent;
        const origin=start instanceof MouseEvent?start:"touches" in start?(start as TouchEvent).touches[0]:null;
        // Dnd-kit deltas also include scroll movement. Use the actual release
        // coordinates for mouse/touch; keyboard drags use the translated item.
        const drop=origin?(dragPointRef.current??{x:origin.clientX+event.delta.x,y:origin.clientY+event.delta.y}):{x:translated.left+translated.width/2,y:translated.top+translated.height/2};
        const point=worldPoint({x:drop.x-rect.left,y:drop.y-rect.top},geometry.camera);
        add(emoji,{x:point.x/geometry.width*100,y:point.y/geometry.height*100});
      }
    }
  }
  async function copy(text:string) {try{await navigator.clipboard.writeText(text);setNotice(t.copied);return true;}catch{setNotice(t.copyFailed);return false;}}
  async function ensureGenerationPersisted(){
    const job=jobRef.current;if(!job?.persistencePending)return;
    const outcome=await readResponse<{run?:GenerationRun}>(await account.request("/api/generations",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:job.run.id,cancelToken:job.token})}));
    job.persistencePending=false;
    if(outcome.run)setActiveRun(current=>current?.id===outcome.run!.id?{...outcome.run!,...(current.result?{result:current.result}:{})}:current);
    const latest=await dataRef.current.refresh();activeCheckpoint.current=latest?.temporary.find(row=>row.state.run?.id===job.run.id)||null;setWriteFailure(null);
  }
  async function saveCreation(state:CreationState=currentState) {
    if(!canSaveState(state))return false;
    try {await ensureGenerationPersisted();await data.put("saved",saveableState(makeState(state.board,state.settings,state.run)));setNotice(c.saveDone);setWriteFailure(null);return true;}
    catch {setNotice(c.saveFailed);setWriteFailure({message:c.saveFailed,retry:()=>saveCreation(state)});return false;}
  }
  async function keepCreation() {
    if(!containsWork(currentState))return;
    try{await ensureGenerationPersisted();const canonicalRun=activeRun?.status==="running"?dataRef.current.temporary.find(row=>row.state.run?.id===activeRun.id)?.state.run||activeRun:activeRun;const row=await data.put("temporary",makeState(board,currentState.settings,canonicalRun));activeCheckpoint.current=row;setNotice(c.kept);setWriteFailure(null);}catch(error){setNotice(error instanceof CreationConflict?c.conflict:c.saveFailed);setWriteFailure({message:error instanceof CreationConflict?c.conflict:c.saveFailed,retry:keepCreation});}
  }
  function requestReplacement(action:()=>void) {
    if(busyRef.current){setNotice(c.wait);return;}
    setPreview(null);setReadingRun(null);
    setReplacementFailed(false);if(containsWork(currentState)&&!saved)setPendingReplacement(()=>action);else action();
  }
  function restoreCreation(source:CreationState,parts:RestoreParts) {
    requestReplacement(()=>{const next=restoreState(currentState,source,parts,locale);if(parts.canvas)dispatch({type:"load",board:next.state.board});else if(parts.configuration)dispatch({type:"replace",board:next.state.board});
      setConfigurationChosen(!!next.state.settings);configurationEdited.current=!!next.state.settings;
      if(next.state.settings){setOutputLocale(next.state.settings.locale);setTone(next.state.settings.tone);setKind(next.state.settings.kind);setModel(next.state.settings.model);setReasoningEffort(next.state.settings.reasoningEffort||"default");}
      else {inactiveDefaults();}
      setActiveRun(next.state.run?structuredClone(next.state.run):null);activeCheckpoint.current=dataRef.current.temporary.find(r=>r.state.id===source.id&&r.state.run?.id===next.state.run?.id)||dataRef.current.temporary.find(r=>r.state.run?.id&&r.state.run.id===next.state.run?.id)||null;
      if(parts.canvas){setSelectedIds([]);setPickerOpen(false);setResetVersion(v=>v+1);setFitVersion(v=>v+1);}setTarget("");setRelation("");setCanvasNotice("");
      setNotice(next.partialContext?c.portable:c.restoreDone);onEdit?.();
    });
  }
  async function removeRecords(collection:Collection,records:CreationRecord[]) {
    try {const receipt=await data.remove(collection,records);setDeleted({collection,records,receipt});setPendingRemoval(null);setWriteFailure(null);setNotice("");}
    catch(error){const message=error instanceof CreationConflict?c.conflict:c.saveFailed;setNotice(message);setRemovalError(message);setWriteFailure({message,conflict:error instanceof CreationConflict,retry:async()=>{const latest=await dataRef.current.refresh();if(!latest)return;const current=latest[collection].filter(row=>records.some(previous=>previous.key===row.key));if(current.length){await removeRecords(collection,current);}else{setWriteFailure(null);}}});}
  }
  function askRemove(collection:Collection,records:CreationRecord[]) {
    if(!records.length)return;setRemovalError("");if(records.length>1)setPendingRemoval({collection,records});else void removeRecords(collection,records);
  }
  async function undoDelete(){if(!deleted)return;try{await data.undo(deleted.receipt);setDeleted(null);}catch(error){setNotice(error instanceof CreationConflict?c.conflict:c.saveFailed);}}
  async function finishRun(job:Job,finished:GenerationRun){
    if(job.finished)return;job.finished=true;
    setActiveRun(current=>current?.id===finished.id?finished:current);
    const next=await dataRef.current.refresh();activeCheckpoint.current=next?.temporary.find(row=>row.state.run?.id===finished.id)||null;
  }
  async function generate() {
    if(!ready||data.error||busyRef.current||jobRef.current?.persistencePending||!board.nodes.length||!config?.configured||!config.models.includes(model))return;
    configurationEdited.current=true;setConfigurationChosen(true);busyRef.current=true;setBusy(true);
    const run:GenerationRun={id:crypto.randomUUID(),createdAt:Date.now(),identity:semanticIdentity(board,settings.locale),board:structuredClone(board),brief:compileBrief(board,settings.locale),settings:{...settings},status:"running"};
    const job:Job={run,token:crypto.randomUUID(),controller:new AbortController(),canceled:false,finished:false};jobRef.current=job;
    setActiveRun(run);setPendingResultId(run.id);
    try {
      activeCheckpoint.current=null;
      if(job.canceled){await finishRun(job,{...run,status:"canceled",errorCode:"canceled"});return;}
      const response=await account.request("/api/generations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:run.id,cancelToken:job.token,board:run.board,settings:run.settings}),signal:AbortSignal.any([job.controller.signal,AbortSignal.timeout(135000)])});
      const result=await response.json();if(job.canceled)return;
      if(result.persistencePending){job.persistencePending=true;setWriteFailure({message:c.saveFailed,retry:ensureGenerationPersisted});}
      await finishRun(job,result.run?result.run:response.ok&&result.result?{...run,status:"succeeded",result:result.result}:{...run,status:result.code==="canceled"?"canceled":result.code==="unknown"||result.code==="unreadable"?"unknown":"failed",error:result.error||t.failedRun,errorCode:typeof result.code==="string"?result.code:undefined});
    }catch{if(!job.canceled)await finishRun(job,{...run,status:"unknown",error:t.unknown,errorCode:"unknown"});}
    finally{if(jobRef.current===job){busyRef.current=false;setBusy(false);}}
  }
  function cancelGeneration(){const job=jobRef.current;if(!job||job.finished)return;job.canceled=true;job.controller.abort();busyRef.current=false;setBusy(false);setPendingResultId(null);setNotice(c.cancelled);
    setActiveRun(current=>current?.id===job.run.id?{...job.run,status:"canceled",errorCode:"canceled"}:current);
    job.finished=true;
    const deliver=async()=>{const outcome=await readResponse<{run?:GenerationRun}>(await account.request("/api/generations",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:job.run.id,cancelToken:job.token}),signal:AbortSignal.timeout(8000)}));if(outcome.run)setActiveRun(current=>current?.id===job.run.id?outcome.run!:current);await dataRef.current.refresh();setWriteFailure(null);};
    void deliver().catch(()=>{setNotice(c.saveFailed);setWriteFailure({message:c.saveFailed,retry:deliver});});
  }
  useEffect(()=>{const job=jobRef.current;if(!busy||!job||job.finished)return;const authoritative=data.temporary.find(row=>row.state.run?.id===job.run.id)?.state.run;if(authoritative&&authoritative.createdAt!==job.run.createdAt){job.run=authoritative;setActiveRun(current=>current?.id===authoritative.id&&current.status==="running"?authoritative:current);}},[busy,data.temporary]);
  useEffect(()=>{if(!busy)return;const timer=setInterval(()=>void dataRef.current.refresh(),500);return()=>clearInterval(timer);},[busy]);
  useEffect(()=>account.registerProtection(next=>{setReplacementFailed(false);if(containsWork(currentState)&&!saved)setPendingReplacement(()=>next);else next();},async()=>{
    const job=jobRef.current;if(!job||job.finished)return;job.canceled=true;job.controller.abort();
    await account.request("/api/generations",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:job.run.id,cancelToken:job.token}),signal:AbortSignal.timeout(8000)});
  }));
  function chooseSettings(patch:Partial<GenerationSettings>){configurationEdited.current=true;setConfigurationChosen(true);const next={...settings,...patch};setOutputLocale(next.locale);setKind(next.kind);setModel(next.model);setReasoningEffort(next.reasoningEffort||"default");account.setPlayground(next);}
  function inactiveDefaults(){setOutputLocale(account.playground?.locale||locale);setTone(account.playground?.tone||t.toneDefault);setKind(account.playground?.kind||"interpretation");setModel(account.playground?.model||config?.models[0]||"");setReasoningEffort(account.playground?.reasoningEffort||config?.reasoningEffort||"default");}
  function resetCanvas(){requestReplacement(()=>{dispatch({type:"load",board:emptyComposition()});setSelectedIds([]);setPickerOpen(false);setCanvasNotice("");setActiveRun(null);activeCheckpoint.current=null;setReadingRun(null);setPendingResultId(null);setTarget("");setRelation("");setNotice("");setConfigurationChosen(false);configurationEdited.current=false;inactiveDefaults();setResetVersion(version=>version+1);boardRef.current?.focus({preventScroll:true});});}
  function clearConfiguration(){dispatch({type:"replace",board:restoreState(currentState,{...currentState,settings:null,run:null},{canvas:false,configuration:true,result:false},locale).state.board});setConfigurationChosen(false);configurationEdited.current=false;inactiveDefaults();}
  // Canvas nodes move directly; the tray needs a preview to cross its scroll boundary.
  const dragGlyph=dragging?.startsWith("tray:")?emojiById.get(dragging.slice(5))?.glyph:undefined;
  const latestRun=activeRun;
  async function persistResultEdit(id:string,text:string,reapply=false){
    const latest=reapply?await dataRef.current.refresh():null;
    const checkpoint=activeCheckpoint.current;
    const row=reapply?(checkpoint?.state.run?.id===id?latest?.temporary.find(row=>row.key===checkpoint.key):latest?.temporary.find(row=>row.state.run?.id===id)):checkpoint?.state.run?.id===id?checkpoint:dataRef.current.temporary.find(row=>row.state.run?.id===id);
    if(!row?.state.run?.result){setNotice(c.conflict);return;}
    try{const updated=await dataRef.current.put("temporary",{...row.state,run:{...row.state.run,result:{...row.state.run.result,text}}},row.revision);activeCheckpoint.current=updated;setWriteFailure(null);}
    catch(error){setNotice(error instanceof CreationConflict?c.conflict:c.saveFailed);setWriteFailure({message:error instanceof CreationConflict?c.conflict:c.saveFailed,conflict:error instanceof CreationConflict,retry:()=>persistResultEdit(id,text,true)});}
  }
  function editResult(id:string,text:string){
    const run=activeRun?.id===id?activeRun:readingRun;if(!run?.result)return;const next={...run,result:{...run.result,text}};
    if(activeRun?.id===id)setActiveRun(next);if(readingRun?.id===id)setReadingRun(next);
    if(dataRef.current.temporary.some(row=>row.state.run?.id===id)){
      if(activeCheckpoint.current?.state.run?.id!==id)activeCheckpoint.current=dataRef.current.temporary.find(row=>row.state.run?.id===id)||null;
      if(editTimer.current)clearTimeout(editTimer.current);const version=++editVersion.current;setEditingPending(true);
      editTimer.current=setTimeout(()=>{editQueue.current=editQueue.current.then(()=>persistResultEdit(id,text)).finally(()=>{if(version===editVersion.current)setEditingPending(false);});},500);
    }
  }
  function resultContent(run:GenerationRun){return <><StoryContent key={run.id} run={run} locale={locale} outputName={outputNames[run.settings.kind]} stale={!resultMatches(board,currentState.settings,run)} onEdit={text=>editResult(run.id,text)} onCopy={text=>copy(text)}/></>;}
  const outputNames:Record<OutputKind,string>={interpretation:t.interpretOutput,message:t.message,poem:t.poem,story:t.story,lyrics:t.lyrics,"image-prompt":t.imagePrompt,storyboard:t.storyboard};
  const inspector=<div className="pg-panel pg-inspector"><h2>{t.inspector}</h2>{selected?<><div className="pg-selected"><span><EmojiArtwork glyph={selected.glyph}/></span><p>{nodeLabel(selected,locale)}</p><button aria-label={t.duplicate} title={t.duplicate} disabled={board.nodes.length>=NODE_LIMIT} onClick={()=>{const node={...selected,id:crypto.randomUUID(),x:clamp(selected.x+5),y:clamp(selected.y+5)};dispatch({type:"add",node});setSelectedIds([node.id]);}}><Copy size={16}/></button><button aria-label={t.remove} title={t.remove} onClick={()=>dispatch({type:"remove",id:selected.id})}><Trash2 size={16}/></button></div><div className="pg-inspector-fields"><MeaningField key={`${selected.id}:${locale}`} label={t.meaning} value={nodeMeaning(selected,locale)} onCommit={meaning=>dispatch({type:"update",id:selected.id,patch:{meaning,customMeaning:true}})}/><label>{t.role}<select aria-label={t.role} value={selected.role} onChange={e=>dispatch({type:"update",id:selected.id,patch:{role:e.target.value as BoardNode["role"]}})}><option value="subject">{t.subject}</option><option value="setting">{t.setting}</option><option value="mood">{t.mood}</option></select></label>{!!emojiById.get(selected.emojiId)?.variants.length&&<label>{t.variant}<select aria-label={t.variant} value={selected.glyph} onChange={e=>dispatch({type:"update",id:selected.id,patch:{glyph:e.target.value}})}><option value={emojiById.get(selected.emojiId)!.glyph}>{emojiById.get(selected.emojiId)!.glyph} {emojiById.get(selected.emojiId)!.labels[locale]}</option>{emojiById.get(selected.emojiId)!.variants.map(v=><option value={v.glyph} key={v.id}>{v.glyph} {v.labels[locale]}</option>)}</select></label>}<label className="pg-note">{t.note}<input aria-label={t.note} maxLength={500} value={selected.note} onChange={e=>dispatch({type:"update",id:selected.id,patch:{note:e.target.value}})}/></label></div>
          {board.nodes.length>1&&<form className="pg-connect" onSubmit={e=>{e.preventDefault();if(target&&relation.trim()&&target!==selected.id){dispatch({type:"edge",edge:{id:crypto.randomUUID(),source:selected.id,target,label:relation.trim()}});setRelation("");}}}><select aria-label={t.target} value={target===selected.id?"":target} onChange={e=>setTarget(e.target.value)}><option value="">{t.target}…</option>{board.nodes.filter(n=>n.id!==selected.id).map((n,i)=><option key={n.id} value={n.id}>{n.glyph} {nodeMeaning(n,locale)} ({i+1})</option>)}</select><input aria-label={t.relationship} maxLength={80} placeholder={t.relationPlaceholder} value={relation} onChange={e=>setRelation(e.target.value)}/><button type="submit" disabled={!board.nodes.some(n=>n.id===target&&n.id!==selected.id)||!relation.trim()}><Plus size={15}/>{t.connect}</button></form>}</>:selectedNodes.length>1?<div className="pg-group-inspector"><p>{t.groupSelected.replace("{count}",String(selectedNodes.length))}</p><p>{t.groupHint}</p><button className="pg-secondary" onClick={()=>{dispatch({type:"removeMany",ids:selectedNodes.map(n=>n.id)});setSelectedIds([]);}}><Trash2 size={15}/>{t.deleteGroup}</button></div>:<p>{t.select}</p>}
          {!!board.edges.length&&<div className="pg-relationships"><h3>{t.connections}</h3>{board.edges.map(e=><div key={e.id}><span>{board.nodes.find(n=>n.id===e.source)?.glyph} {e.label} → {board.nodes.find(n=>n.id===e.target)?.glyph}</span><button aria-label={`${t.remove} ${e.label}`} onClick={()=>dispatch({type:"removeEdge",id:e.id})}><X size={14}/></button></div>)}</div>}</div>;
  if(!ready)return <div className="pg-loading" role="status">{t.loading}</div>;
  return <section className={`playground ${dragging?"is-dragging":""}`} aria-label={t.name}>
    {(writeFailure||data.error)&&<div className="account-save-status" role="status"><span>{writeFailure?.message||c.readFailed}</span><button onClick={()=>{if(writeFailure)void writeFailure.retry().catch(()=>setNotice(c.saveFailed));else void data.refresh();}}>{writeFailure?.conflict?(locale==="es"?"Aplicar mis cambios":"Reapply my changes"):c.retry}</button>{writeFailure?.conflict&&<button onClick={()=>{void data.refresh();setWriteFailure(null);}}>{locale==="es"?"Cargar historial actual":"Reload history"}</button>}</div>}
    {(notice||readNotice)&&<div className="storage-notice" role="status"><span>{readNotice?c.readFailed:notice}</span>{readNotice&&<button onClick={()=>{setReadNotice(true);void data.refresh();}}>{c.retry}</button>}<button aria-label={t.closeNotice} onClick={()=>{setNotice("");setReadNotice(false);}}><X size={16}/></button></div>}
    {view==="creations"&&busy&&generationNotice&&<div className="storage-notice" role="status"><span>{c.running}</span><button onClick={cancelGeneration}>{c.cancelGeneration}</button></div>}
    <div hidden={view!=="creations"}><SavedCreations records={data.saved} locale={locale} outputNames={outputNames} busy={busy} onRestore={restoreCreation} onRemove={records=>askRemove("saved",records)} onCopy={copy} onBack={()=>onEdit?.()}/>{deleted?.collection==="saved"&&<div className="storage-notice" role="status"><span>{c.removed}</span><button onClick={()=>void undoDelete()}>{c.undo}</button></div>}</div>
    <div hidden={view!=="editor"}>
    <div className="cr-actions"><span className={`cr-action-status ${saved?"":"unsaved"}`}>{saved?<BookmarkCheck size={15}/>:<Bookmark size={15}/>} {saved?c.saved:c.unsaved}</span><div className="cr-action-buttons"><button disabled={!ready||data.error||busy&&!data.temporary.some(row=>row.state.run?.id===activeRun?.id)||!containsWork(currentState)||data.writing} onClick={()=>void keepCreation()}><History size={15}/>{c.keep}</button><button className="cr-save" disabled={!ready||data.error||!canSaveState(currentState)||data.writing} onClick={()=>void saveCreation()}><Bookmark size={15}/>{c.save}</button><button disabled={busy} onClick={resetCanvas}><Plus size={15}/>{c.new}</button></div></div>
    <CreationHeader
      locale={locale} board={board} interpretation={displayBrief.interpretation}
      outputLocale={outputLocale} onOutputLocale={value=>chooseSettings({locale:value})}
      kind={kind} onKind={value=>chooseSettings({kind:value})} outputNames={outputNames}
      model={model} onModel={value=>chooseSettings({model:value})} reasoningEffort={reasoningEffort} onReasoning={value=>chooseSettings({reasoningEffort:value})}
      generationDisabled={!ready||data.error||!!jobRef.current?.persistencePending} config={config} configFailed={configFailed} onCheck={()=>void checkConnection()}
      busy={busy} status={busy?t.generating:latestRun?.status==="succeeded"?t.generated:""}
      error={latestRun&&(latestRun.status==="failed"||latestRun.status==="unknown"||latestRun.status==="canceled")?generationErrorMessage(latestRun,locale):undefined}
      onGenerate={()=>void generate()} onFields={patch=>dispatch({type:"fields",patch})}
      onCopy={()=>void copy(displayBrief.interpretation)} onCancel={cancelGeneration}
      inspector={inspector}
    />
    {configurationActive&&<button className="cr-config-reset" onClick={clearConfiguration}><SlidersHorizontal size={13}/>{c.clearConfiguration}</button>}
    <DndContext id="playground-editor" accessibility={dragAccessibility(locale,true)} sensors={sensors} autoScroll={false} onDragStart={e=>{setDragging(String(e.active.id));}} onDragEnd={endDrag} onDragCancel={()=>setDragging(null)}>
      <div className="pg-workspace">
        <div className="pg-canvas-column"><Canvas onUndo={()=>dispatch({type:"undo"})} onRedo={()=>dispatch({type:"redo"})} onReset={resetCanvas} resetDisabled={busy} notice={canvasNotice} onCopyEvent={handleCopy} onPasteEvent={handlePaste} onCopy={copyObjects} onPaste={pasteObjects} canPaste={canPaste&&board.nodes.length<NODE_LIMIT} onArrange={direction=>{dispatch({type:"arrange",ids:selectedIds,direction});setCanvasNotice(t.layerChanged);}} resetVersion={resetVersion} fitVersion={fitVersion} board={board} locale={locale} selectedIds={selectedNodes.map(n=>n.id)} onSelect={setSelectedIds} onTransform={nodes=>dispatch({type:"transform",updates:nodes.map(({id,x,y,scale,rotation})=>({id,patch:{x,y,scale,rotation}}))})} onRemove={ids=>{dispatch({type:"removeMany",ids});setSelectedIds([]);}} onAdd={()=>setPickerOpen(true)} boardRef={boardRef} geometryRef={geometryRef} pickerOpen={pickerOpen} trayDragging={!!dragging} setPickerOpen={setPickerOpen} overlay={<DragOverlay dropAnimation={null}>{dragGlyph&&<span className="pg-drag-glyph"><EmojiArtwork glyph={dragGlyph}/></span>}</DragOverlay>} toolbar={<div className="pg-canvas-toolbar"><output aria-label={t.objectCount.replace("{count}",String(board.nodes.length)).replace("{limit}",String(NODE_LIMIT))}>{board.nodes.length}/{NODE_LIMIT}</output><div><ToolbarTooltip label={t.undoHint} shortcut="Z"><button aria-label={t.undo} aria-keyshortcuts="Control+Z Meta+Z" disabled={!history.past.length} onClick={()=>dispatch({type:"undo"})}><Undo2 size={17}/></button></ToolbarTooltip><ToolbarTooltip label={t.redoHint} shortcut="Shift+Z"><button aria-label={t.redo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" disabled={!history.future.length} onClick={()=>dispatch({type:"redo"})}><Redo2 size={17}/></button></ToolbarTooltip><ToolbarTooltip label={t.clearHint} shortcut="R"><button aria-label={t.clear} aria-keyshortcuts="Control+R Meta+R" disabled={busy} onClick={resetCanvas}><RotateCcw size={16}/></button></ToolbarTooltip></div></div>} picker={<EmojiPicker sceneEmojiIds={board.nodes.map(n=>n.emojiId)} locale={locale} state={pickerState} onChange={setPickerState} onAdd={add} disabled={board.nodes.length>=NODE_LIMIT}/>}/>
          <p id="pg-canvas-keyboard-hint" className="pg-hint">{t.hint}</p><p className="pg-save" role="status">{data.writing||editingPending?t.saving:saved?c.saved:c.unsaved}</p>

        </div>
        <aside ref={resultsRef} className="pg-output" aria-label={t.result}>
          {latestRun&&<ReadingButton locale={locale} onClick={()=>setReadingRun(latestRun)}/>}
          {latestRun&&!resultMatches(board,currentState.settings,latestRun)&&latestRun.result&&<div className="cr-reference"><strong>{c.reference}</strong>{c.referenceHint}<button className="pg-link" onClick={()=>setPreview(makeState(latestRun.board,latestRun.settings,latestRun))}>{c.source}</button></div>}
          {latestRun?resultContent(latestRun):<StoryPage><span className="pg-story-kicker">{s.chapter}</span><StorySymbols nodes={board.nodes} locale={locale}/><h3 className="pg-story-title">{s.blank}</h3><div className="pg-story-divider" aria-hidden="true"><span>✧</span></div><p className="pg-story-invitation">{s.blankHint}</p><Feather className="pg-story-feather" size={36}/><span className="pg-story-end" aria-hidden="true">❧</span></StoryPage>}
        </aside>
      </div>
    </DndContext>
    <TemporaryCreations records={data.temporary} saved={data.saved} locale={locale} outputNames={outputNames} busy={busy} onRestore={restoreCreation} onSave={state=>void saveCreation(state)} onRemove={records=>askRemove("temporary",records)} onView={setPreview} undo={deleted?.collection==="temporary"} onUndo={()=>void undoDelete()}/>
    </div>
    {readingRun&&<StoryModal title={creationTitle(readingRun)||outputNames[readingRun.settings.kind]} locale={locale} onClose={()=>setReadingRun(null)}>{resultContent(readingRun)}</StoryModal>}
    {preview&&<StoryModal title={preview.run?creationTitle(preview.run)||outputNames[preview.run.settings.kind]:preview.board.title||c.untitled} locale={locale} onClose={()=>setPreview(null)}><CreationDetail state={preview} locale={locale} outputNames={outputNames} busy={busy} onRestore={restoreCreation} onCopy={copy}/></StoryModal>}
    {pendingReplacement&&<CreationDialog locale={locale} title={c.replaceTitle} onCancel={()=>setPendingReplacement(null)}><p>{c.replaceHint}</p>{replacementFailed&&<p role="alert">{c.saveFailed}</p>}<div className="cr-dialog-actions"><button autoFocus className="primary-button" disabled={data.writing||!canSaveState(currentState)} onClick={async()=>{if(await saveCreation()){const action=pendingReplacement;setPendingReplacement(null);action();}else setReplacementFailed(true);}}>{c.saveContinue}</button><button onClick={()=>{const action=pendingReplacement;setPendingReplacement(null);action();}}>{c.discardContinue}</button><button onClick={()=>setPendingReplacement(null)}>{c.cancel}</button></div></CreationDialog>}
    {pendingRemoval&&<CreationDialog locale={locale} title={pendingRemoval.collection==="temporary"?c.removeTitle:locale==="es"?"¿Eliminar estas creaciones guardadas?":"Remove these saved creations?"} onCancel={()=>setPendingRemoval(null)}><p>{pendingRemoval.collection==="temporary"?c.removeHint:locale==="es"?"El historial temporal y el editor actual se conservarán.":"Temporary history and the current editor will stay intact."}</p>{removalError&&<p role="alert">{removalError}</p>}<div className="cr-dialog-actions"><button className="primary-button" disabled={data.writing} onClick={()=>void removeRecords(pendingRemoval.collection,pendingRemoval.records)}>{c.remove} ({pendingRemoval.records.length})</button><button onClick={()=>setPendingRemoval(null)}>{c.cancel}</button></div></CreationDialog>}

  </section>;
}

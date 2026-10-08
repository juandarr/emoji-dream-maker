import { emojiById } from "@/lib/catalog";
import type { Locale } from "@/lib/types";
import { outputKinds, reasoningEfforts, type GenerationRun, type GenerationSettings } from "@/features/generation/model";
import { createNode, parseComposition, type Composition } from "./model";

/** Portable authored state. Browser/account repositories own collection membership. */
export type CreationState = { schemaVersion:1; id:string; createdAt:number; board:Composition; settings:GenerationSettings|null; run:GenerationRun|null };
export type RestoreParts = { canvas:boolean; configuration:boolean; result:boolean };
export const completeRestore:RestoreParts = {canvas:true,configuration:true,result:true};
export type CanvasSnapshot = ReturnType<typeof canvasSnapshot>;
export type ConfigurationSnapshot = ReturnType<typeof configurationSnapshot>;
export type ResultSnapshot = GenerationRun;
export type Collection = "temporary" | "saved";
export type CreationRecord = { key:string; namespace:string; collection:Collection; identity:string; revision:number; updatedAt?:number; state:CreationState };

export function canvasSnapshot(board:Composition) {
  return board.nodes.map(n=>({emojiId:n.emojiId,glyph:n.glyph,x:n.x,y:n.y,scale:n.scale,rotation:n.rotation}));
}
export function canvasIdentity(board:Composition) { return JSON.stringify({version:1,nodes:canvasSnapshot(board)}); }
export function configurationSnapshot(board:Composition,settings:GenerationSettings|null) {
  if(!settings)return null;
  const slots=new Map(board.nodes.map((n,i)=>[n.id,i]));
  return {title:board.title,intent:board.intent,interpretation:board.interpretation,
    meanings:board.nodes.map(n=>({label:n.label,meaning:n.meaning,customMeaning:n.customMeaning===true,note:n.note,role:n.role})),
    relationships:board.edges.map(e=>({source:slots.get(e.source),target:slots.get(e.target),label:e.label})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    settings:{kind:settings.kind,locale:settings.locale,tone:settings.tone,model:settings.model,reasoningEffort:settings.reasoningEffort||"default"}};
}
export function configurationIdentity(board:Composition,settings:GenerationSettings|null) { return JSON.stringify(configurationSnapshot(board,settings)); }
export function resultMatches(board:Composition,settings:GenerationSettings|null,run:GenerationRun|null) {
  return !!run&&!!settings&&canvasIdentity(board)===canvasIdentity(run.board)&&configurationIdentity(board,settings)===configurationIdentity(run.board,run.settings);
}
export function stateIdentity(state:Pick<CreationState,"board"|"settings"|"run">) {
  return JSON.stringify({version:1,canvas:canvasIdentity(state.board),configuration:configurationIdentity(state.board,state.settings),
    result:state.run?.status==="succeeded"&&resultMatches(state.board,state.settings,state.run)?{id:state.run.id,result:state.run.result}:null});
}
export function makeState(board:Composition,settings:GenerationSettings|null,run:GenerationRun|null=null):CreationState {
  return {schemaVersion:1,id:crypto.randomUUID(),createdAt:Date.now(),board:structuredClone(board),settings:settings?{...settings}:null,run:run?structuredClone(run):null};
}
export function saveableState(state:CreationState):CreationState {
  return {...state,run:state.run?.status==="succeeded"&&resultMatches(state.board,state.settings,state.run)?state.run:null};
}
export function containsWork(state:Pick<CreationState,"board"|"settings"|"run">) {return !!(state.board.nodes.length||state.settings||state.run);}
export function canSaveState(state:Pick<CreationState,"board"|"settings">) {return !!(state.board.nodes.length||state.settings);}
export function isStateSaved(state:Pick<CreationState,"board"|"settings"|"run">,saved:CreationRecord[]) {
  if(!containsWork(state))return false;
  const canvas=canvasIdentity(state.board),configuration=configurationIdentity(state.board,state.settings);
  return saved.some(({state:s})=>canvasIdentity(s.board)===canvas&&(!state.settings||configurationIdentity(s.board,s.settings)===configuration)&&
    (!(state.run?.status==="succeeded"&&resultMatches(state.board,state.settings,state.run))||stateIdentity(s)===stateIdentity(state)));
}
export function defaultCanvas(board:Composition,locale:Locale):Composition {
  return {...board,title:"",intent:"",interpretation:"",edges:[],nodes:board.nodes.map(n=>{
    const emoji=emojiById.get(n.emojiId);
    const defaults=emoji?createNode(emoji,locale,n.id,0):{label:n.label,meaning:n.label};
    const {customMeaning,...rest}=n;void customMeaning;
    return {...rest,label:defaults.label,meaning:defaults.meaning,note:"",role:"subject" as const};
  })};
}
function bindContext(target:Composition,source:Composition):Composition {
  const ids=new Map(source.nodes.map((n,i)=>[n.id,target.nodes[i].id]));
  return {...target,title:source.title,intent:source.intent,interpretation:source.interpretation,
    nodes:target.nodes.map((n,i)=>{const s=source.nodes[i];const {customMeaning,...rest}=n;void customMeaning;return {...rest,label:s.label,meaning:s.meaning,...(s.customMeaning?{customMeaning:true}:{}),note:s.note,role:s.role};}),
    edges:source.edges.map(e=>({...e,source:ids.get(e.source)!,target:ids.get(e.target)!}))};
}
export function restoreState(current:CreationState,source:CreationState,parts:RestoreParts,locale:Locale):{state:CreationState;partialContext:boolean} {
  let board=current.board,settings=current.settings;let partialContext=false;
  if(parts.canvas){
    const same=canvasIdentity(current.board)===canvasIdentity(source.board);
    board=defaultCanvas(source.board,locale);
    if(current.settings)board=same?bindContext(board,current.board):{...board,title:current.board.title,intent:current.board.intent,interpretation:current.board.interpretation};
    partialContext=!same&&!!current.settings&&!parts.configuration;
  }
  if(parts.configuration){
    settings=source.settings;
    if(!settings)board=defaultCanvas(board,locale);
    else if(canvasIdentity(board)===canvasIdentity(source.board))board=bindContext(board,source.board);
    else {board={...board,title:source.board.title,intent:source.board.intent,interpretation:source.board.interpretation};partialContext=true;}
  }
  return {state:{...current,board,settings,run:parts.result?source.run:current.run},partialContext};
}
export function projectState(state:CreationState,depth:"canvas"|"configuration"|"result",locale:Locale):CreationState {
  return depth==="canvas"?{...state,board:defaultCanvas(state.board,locale),settings:null,run:null}:depth==="configuration"?{...state,run:null}:state;
}
function parseSettings(value:unknown):GenerationSettings {
  const settings=value as GenerationSettings;
  if(!settings||!outputKinds.includes(settings.kind)||!["en","es"].includes(settings.locale)||typeof settings.model!=="string"||settings.model.length>150||typeof settings.tone!=="string"||settings.tone.length>120||settings.reasoningEffort!==undefined&&!reasoningEfforts.includes(settings.reasoningEffort))throw new Error("Invalid configuration");
  return {kind:settings.kind,locale:settings.locale,model:settings.model,tone:settings.tone,...(settings.reasoningEffort?{reasoningEffort:settings.reasoningEffort}:{})};
}
export function parseState(value:unknown):CreationState {
  const s=value as CreationState;
  if(!s||s.schemaVersion!==1||typeof s.id!=="string"||!s.id||s.id.length>150||typeof s.createdAt!=="number"||!Number.isFinite(s.createdAt)||Math.abs(s.createdAt)>8640000000000000)throw new Error("Invalid creation");
  const board=parseComposition(s.board),settings=s.settings===null?null:parseSettings(s.settings);
  let run:GenerationRun|null=null;
  // A damaged optional result must not hide the canvas/configuration it belongs to.
  if(s.run)try{
    const r=s.run,runSettings=parseSettings(r.settings),runBoard=parseComposition(r.board);
    if(typeof r.id!=="string"||r.id.length>100||typeof r.identity!=="string"||r.identity.length>512000||!Number.isFinite(r.createdAt)||Math.abs(r.createdAt)>8640000000000000||!["running","succeeded","failed","unknown","canceled"].includes(r.status)||!r.brief||typeof r.brief.interpretation!=="string"||r.brief.interpretation.length>512000)throw new Error("Invalid result");
    if(r.status==="succeeded"&&!r.result)throw new Error("Missing result");
    if(r.result&&(typeof r.result.text!=="string"||r.result.text.length>16000||typeof r.result.model!=="string"||r.result.model.length>150||r.result.provider!=="openrouter"))throw new Error("Invalid output");
    const usage=r.result?.usage;
    run={...r,board:runBoard,settings:runSettings,...(r.result?{result:{...r.result,title:typeof r.result.title==="string"?r.result.title.slice(0,120):undefined,usage:usage&&Number.isFinite(usage.promptTokens)&&Number.isFinite(usage.completionTokens)?{promptTokens:usage.promptTokens,completionTokens:usage.completionTokens,...(Number.isFinite(usage.cost)?{cost:usage.cost}:{})}:undefined}}:{})};
  }catch{ /* Preserve the original stored record; expose its valid authored inputs. */ }
  return {schemaVersion:1,id:s.id,createdAt:s.createdAt,board,settings,run};
}
export function groupCreations(records:CreationRecord[]) {
  const groups=new Map<string,{key:string;board:Composition;records:CreationRecord[];configurations:Map<string,CreationRecord[]>}>();
  for(const record of records){const key=canvasIdentity(record.state.board);let group=groups.get(key);if(!group){group={key,board:record.state.board,records:[],configurations:new Map()};groups.set(key,group);}group.records.push(record);
    const config=configurationIdentity(record.state.board,record.state.settings);const branch=group.configurations.get(config)||[];branch.push(record);group.configurations.set(config,branch);}
  return [...groups.values()];
}

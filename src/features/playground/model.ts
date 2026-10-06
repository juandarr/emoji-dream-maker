import { defaultTopic } from "@/lib/catalog";
import type { EmojiRecord, Locale } from "@/lib/types";
import { nodeMeaning } from "./localization";

export const NODE_LIMIT = 80;
export type BoardNode = {
  id: string; emojiId: string; glyph: string; label: string; meaning: string; customMeaning?: boolean;
  note: string; role: "subject" | "setting" | "mood"; x: number; y: number; scale:number; rotation:number;
};
export type BoardEdge = { id: string; source: string; target: string; label: string };
export type Composition = {
  schemaVersion: 1; title: string; nodes: BoardNode[]; edges: BoardEdge[];
  intent: string; interpretation: string;
};
export const emptyComposition = (): Composition => ({ schemaVersion: 1, title: "", nodes: [], edges: [], intent: "", interpretation: "" });
export const clamp = (n: number) => Math.min(100000, Math.max(-100000, n));
export function createNode(emoji: EmojiRecord, locale: Locale, id: string, index: number, position?: {x:number;y:number}, glyph?: string): BoardNode {
  return { id, emojiId: emoji.id, glyph: glyph || emoji.glyph, label: emoji.labels[locale], meaning: defaultTopic(emoji, locale).label, note: "", role: "subject", scale:1, rotation:0, x: clamp(position?.x ?? 20 + index % 5 * 15), y: clamp(position?.y ?? 24 + Math.floor(index / 5) % 4 * 18) };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number, required = false): v is string => typeof v === "string" && v.length <= max && (!required || !!v.trim());
const id = (v: unknown): v is string => str(v, 100, true) && /^[\w-]+$/.test(v);
/** Imports contain plain text only. Saved unknown catalog IDs retain their glyph and authored meaning. */
export function parseComposition(value: unknown): Composition {
  if (!object(value) || value.schemaVersion !== 1 || !str(value.title, 120) || !str(value.intent, 1000) || !str(value.interpretation, 4000) || !Array.isArray(value.nodes) || value.nodes.length > NODE_LIMIT || !Array.isArray(value.edges) || value.edges.length > 160) throw new Error("Invalid board or unsupported version.");
  const nodes: BoardNode[] = value.nodes.map(n => {
    if (!object(n) || !id(n.id) || !id(n.emojiId) || !str(n.glyph, 40, true) || !str(n.label, 150, true) || !str(n.meaning, 150, true) || !str(n.note, 500) || !["subject", "setting", "mood"].includes(String(n.role)) || typeof n.x !== "number" || !Number.isFinite(n.x) || Math.abs(n.x) > 100000 || typeof n.y !== "number" || !Number.isFinite(n.y) || Math.abs(n.y) > 100000) throw new Error("Invalid emoji instance.");
    if(n.scale!==undefined&&(typeof n.scale!=="number"||!Number.isFinite(n.scale)||n.scale<.2||n.scale>12)||n.rotation!==undefined&&(typeof n.rotation!=="number"||!Number.isFinite(n.rotation)||Math.abs(n.rotation)>360000))throw new Error("Invalid emoji transform.");
    return { scale:n.scale===undefined?1:n.scale as number, rotation:n.rotation===undefined?0:((n.rotation as number)%360+360)%360, id:n.id, emojiId:n.emojiId, glyph:n.glyph, label:n.label, meaning:n.meaning, ...(n.customMeaning===true?{customMeaning:true}:{}), note:n.note, role:n.role as BoardNode["role"], x:n.x, y:n.y };
  });
  const ids = new Set(nodes.map(n => n.id));
  if (ids.size !== nodes.length) throw new Error("Duplicate emoji instance IDs.");
  const edges: BoardEdge[] = value.edges.map(e => {
    if (!object(e) || !id(e.id) || !id(e.source) || !id(e.target) || !ids.has(e.source) || !ids.has(e.target) || e.source === e.target || !str(e.label, 80, true)) throw new Error("Invalid relationship.");
    return {id:e.id,source:e.source,target:e.target,label:e.label};
  });
  if (new Set(edges.map(e => e.id)).size !== edges.length) throw new Error("Duplicate relationship IDs.");
  return {schemaVersion:1,title:value.title,nodes,edges,intent:value.intent,interpretation:value.interpretation};
}
export type BoardAction =
  | {type:"add";node:BoardNode} | {type:"update";id:string;patch:Partial<Omit<BoardNode,"id"|"emojiId">>}
  | {type:"paste";nodes:BoardNode[];edges:BoardEdge[]}
  | {type:"arrange";ids:string[];direction:ArrangeDirection}
  | {type:"transform";updates:{id:string;patch:Pick<BoardNode,"x"|"y"|"scale"|"rotation">}[]} | {type:"removeMany";ids:string[]}
  | {type:"remove";id:string} | {type:"edge";edge:BoardEdge} | {type:"removeEdge";id:string}
  | {type:"fields";patch:Partial<Pick<Composition,"title"|"intent"|"interpretation">>}
  | {type:"load";board:Composition} | {type:"replace";board:Composition} | {type:"undo"} | {type:"redo"};
export type BoardHistory = {past:Composition[];present:Composition;future:Composition[]};
export type ArrangeDirection="front"|"forward"|"backward"|"back";
/** Array order is the persisted stack, back to front. A selection keeps its internal order. */
export function arrangeNodes(nodes:BoardNode[],ids:string[],direction:ArrangeDirection):BoardNode[] {
  const selected=new Set(ids),next=[...nodes];
  if(direction==="front"||direction==="back"){
    const picked=nodes.filter(n=>selected.has(n.id)),rest=nodes.filter(n=>!selected.has(n.id));
    return direction==="front"?[...rest,...picked]:[...picked,...rest];
  }
  if(direction==="forward")for(let i=next.length-2;i>=0;i--){if(selected.has(next[i].id)&&!selected.has(next[i+1].id))[next[i],next[i+1]]=[next[i+1],next[i]];}
  else for(let i=1;i<next.length;i++){if(selected.has(next[i].id)&&!selected.has(next[i-1].id))[next[i],next[i-1]]=[next[i-1],next[i]];}
  return next;
}
export function boardReducer(state:BoardHistory,action:BoardAction): BoardHistory {
  if (action.type === "load") return {past:[],present:action.board,future:[]};
  if (action.type === "undo") return state.past.length ? {past:state.past.slice(0,-1),present:state.past.at(-1)!,future:[state.present,...state.future].slice(0,50)} : state;
  if (action.type === "redo") return state.future.length ? {past:[...state.past,state.present].slice(-50),present:state.future[0],future:state.future.slice(1)} : state;
  const board=state.present;
  let next=board;
  switch(action.type) {
    case "add": if(board.nodes.length < NODE_LIMIT && !board.nodes.some(n=>n.id===action.node.id)) next={...board,nodes:[...board.nodes,action.node]}; break;
    case "paste": {
      const ids=new Set([...board.nodes,...action.nodes].map(n=>n.id)),edgeIds=new Set([...board.edges,...action.edges].map(e=>e.id));
      if(board.nodes.length+action.nodes.length<=NODE_LIMIT&&board.edges.length+action.edges.length<=160&&ids.size===board.nodes.length+action.nodes.length&&edgeIds.size===board.edges.length+action.edges.length&&action.edges.every(e=>ids.has(e.source)&&ids.has(e.target)&&e.source!==e.target))next={...board,nodes:[...board.nodes,...action.nodes],edges:[...board.edges,...action.edges]};
      break;
    }
    case "arrange": next={...board,nodes:arrangeNodes(board.nodes,action.ids,action.direction)};break;
    case "update": next={...board,nodes:board.nodes.map(n=>n.id===action.id?{...n,...action.patch}:n)}; break;
    case "transform": {const updates=new Map(action.updates.map(u=>[u.id,u.patch]));next={...board,nodes:board.nodes.map(n=>updates.has(n.id)?{...n,...updates.get(n.id)!}:n)};break;}
    case "removeMany": {const ids=new Set(action.ids);next={...board,nodes:board.nodes.filter(n=>!ids.has(n.id)),edges:board.edges.filter(e=>!ids.has(e.source)&&!ids.has(e.target))};break;}
    case "remove": next={...board,nodes:board.nodes.filter(n=>n.id!==action.id),edges:board.edges.filter(e=>e.source!==action.id&&e.target!==action.id)}; break;
    case "edge": if(board.edges.length<160 && action.edge.source!==action.edge.target && [action.edge.source,action.edge.target].every(id=>board.nodes.some(n=>n.id===id))) next={...board,edges:[...board.edges,action.edge]}; break;
    case "removeEdge": next={...board,edges:board.edges.filter(e=>e.id!==action.id)}; break;
    case "fields": next={...board,...action.patch}; break;
    case "replace": next=action.board; break;
  }
  return JSON.stringify(board)===JSON.stringify(next)?state:{past:[...state.past,board].slice(-50),present:next,future:[]};
}
export function compileBrief(board:Composition,locale:Locale) {
  board={...board,nodes:board.nodes.map(node=>({...node,meaning:nodeMeaning(node,locale)}))};
  const entities=board.nodes.map(({id,glyph,meaning,note,role})=>({id,glyph,meaning,note,role})).sort((a,b)=>a.id.localeCompare(b.id));
  // Keep the author's arrangement alongside their words, including repeated symbols.
  // These are world coordinates: zooming and panning do not change the story input.
  const layout=board.nodes.map(({id,x,y,scale,rotation})=>({id,xPercent:x,yPercent:y,sizeMultiplier:scale,clockwiseRotationDegrees:((rotation%360)+360)%360})).sort((a,b)=>a.id.localeCompare(b.id));
  const relationships=board.edges.map(({source,target,label})=>({source,target,label})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const list=board.nodes.map(n=>`${n.glyph} ${n.meaning}${n.role!=="subject"?` (${locale==="es"?(n.role==="mood"?"ánimo":"ambiente"):n.role})`:""}${n.note?`: ${n.note}`:""}`).join("; ");
  const relations=board.edges.map(e=>`${board.nodes.find(n=>n.id===e.source)?.meaning} → ${e.label} → ${board.nodes.find(n=>n.id===e.target)?.meaning}`).join("; ");
  const preview=board.nodes.length ? [board.title,`${locale==="es"?"Ideas elegidas":"Chosen ideas"}: ${list}.`,relations&&`${locale==="es"?"Relaciones":"Relationships"}: ${relations}.`,board.intent&&`${locale==="es"?"Intención":"Intent"}: ${board.intent}`].filter(Boolean).join("\n") : "";
  return {compilerVersion:3,locale,title:board.title,entities,relationships,intent:board.intent,interpretation:board.interpretation.trim()||preview,layout,stackingOrder:board.nodes.map(n=>n.id)};
}
export function semanticIdentity(board:Composition,locale:Locale) { return JSON.stringify(compileBrief(board,locale)); }

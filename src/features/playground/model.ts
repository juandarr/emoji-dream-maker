import { defaultTopic } from "@/lib/catalog";
import type { EmojiRecord, Locale } from "@/lib/types";

export const NODE_LIMIT = 80;
export type BoardNode = {
  id: string; emojiId: string; glyph: string; label: string; meaning: string;
  note: string; role: "subject" | "setting" | "mood"; x: number; y: number;
};
export type BoardEdge = { id: string; source: string; target: string; label: string };
export type Composition = {
  schemaVersion: 1; title: string; nodes: BoardNode[]; edges: BoardEdge[];
  intent: string; interpretation: string;
};
export const emptyComposition = (): Composition => ({ schemaVersion: 1, title: "", nodes: [], edges: [], intent: "", interpretation: "" });
export const clamp = (n: number) => Math.min(100000, Math.max(-100000, n));
export function createNode(emoji: EmojiRecord, locale: Locale, id: string, index: number, position?: {x:number;y:number}, glyph?: string): BoardNode {
  return { id, emojiId: emoji.id, glyph: glyph || emoji.glyph, label: emoji.labels[locale], meaning: defaultTopic(emoji, locale).label, note: "", role: "subject", x: clamp(position?.x ?? 20 + index % 5 * 15), y: clamp(position?.y ?? 24 + Math.floor(index / 5) % 4 * 18) };
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number, required = false): v is string => typeof v === "string" && v.length <= max && (!required || !!v.trim());
const id = (v: unknown): v is string => str(v, 100, true) && /^[\w-]+$/.test(v);
/** Imports contain plain text only. Saved unknown catalog IDs retain their glyph and authored meaning. */
export function parseComposition(value: unknown): Composition {
  if (!object(value) || value.schemaVersion !== 1 || !str(value.title, 120) || !str(value.intent, 1000) || !str(value.interpretation, 4000) || !Array.isArray(value.nodes) || value.nodes.length > NODE_LIMIT || !Array.isArray(value.edges) || value.edges.length > 160) throw new Error("Invalid board or unsupported version.");
  const nodes: BoardNode[] = value.nodes.map(n => {
    if (!object(n) || !id(n.id) || !id(n.emojiId) || !str(n.glyph, 40, true) || !str(n.label, 150, true) || !str(n.meaning, 150, true) || !str(n.note, 500) || !["subject", "setting", "mood"].includes(String(n.role)) || typeof n.x !== "number" || !Number.isFinite(n.x) || Math.abs(n.x) > 100000 || typeof n.y !== "number" || !Number.isFinite(n.y) || Math.abs(n.y) > 100000) throw new Error("Invalid emoji instance.");
    return { id:n.id, emojiId:n.emojiId, glyph:n.glyph, label:n.label, meaning:n.meaning, note:n.note, role:n.role as BoardNode["role"], x:n.x, y:n.y };
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
  | {type:"remove";id:string} | {type:"edge";edge:BoardEdge} | {type:"removeEdge";id:string}
  | {type:"fields";patch:Partial<Pick<Composition,"title"|"intent"|"interpretation">>}
  | {type:"load";board:Composition} | {type:"replace";board:Composition} | {type:"undo"} | {type:"redo"};
export type BoardHistory = {past:Composition[];present:Composition;future:Composition[]};
export function boardReducer(state:BoardHistory,action:BoardAction): BoardHistory {
  if (action.type === "load") return {past:[],present:action.board,future:[]};
  if (action.type === "undo") return state.past.length ? {past:state.past.slice(0,-1),present:state.past.at(-1)!,future:[state.present,...state.future].slice(0,50)} : state;
  if (action.type === "redo") return state.future.length ? {past:[...state.past,state.present].slice(-50),present:state.future[0],future:state.future.slice(1)} : state;
  const board=state.present;
  let next=board;
  switch(action.type) {
    case "add": if(board.nodes.length < NODE_LIMIT && !board.nodes.some(n=>n.id===action.node.id)) next={...board,nodes:[...board.nodes,action.node]}; break;
    case "update": next={...board,nodes:board.nodes.map(n=>n.id===action.id?{...n,...action.patch}:n)}; break;
    case "remove": next={...board,nodes:board.nodes.filter(n=>n.id!==action.id),edges:board.edges.filter(e=>e.source!==action.id&&e.target!==action.id)}; break;
    case "edge": if(board.edges.length<160 && action.edge.source!==action.edge.target && [action.edge.source,action.edge.target].every(id=>board.nodes.some(n=>n.id===id))) next={...board,edges:[...board.edges,action.edge]}; break;
    case "removeEdge": next={...board,edges:board.edges.filter(e=>e.id!==action.id)}; break;
    case "fields": next={...board,...action.patch}; break;
    case "replace": next=action.board; break;
  }
  return JSON.stringify(board)===JSON.stringify(next)?state:{past:[...state.past,board].slice(-50),present:next,future:[]};
}
export function compileBrief(board:Composition,locale:Locale) {
  const entities=board.nodes.map(({id,glyph,meaning,note,role})=>({id,glyph,meaning,note,role})).sort((a,b)=>a.id.localeCompare(b.id));
  const relationships=board.edges.map(({source,target,label})=>({source,target,label})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const list=board.nodes.map(n=>`${n.glyph} ${n.meaning}${n.role!=="subject"?` (${locale==="es"?(n.role==="mood"?"ánimo":"ambiente"):n.role})`:""}${n.note?`: ${n.note}`:""}`).join("; ");
  const relations=board.edges.map(e=>`${board.nodes.find(n=>n.id===e.source)?.meaning} → ${e.label} → ${board.nodes.find(n=>n.id===e.target)?.meaning}`).join("; ");
  const preview=board.nodes.length ? [board.title,`${locale==="es"?"Ideas elegidas":"Chosen ideas"}: ${list}.`,relations&&`${locale==="es"?"Relaciones":"Relationships"}: ${relations}.`,board.intent&&`${locale==="es"?"Intención":"Intent"}: ${board.intent}`].filter(Boolean).join("\n") : "";
  return {compilerVersion:1,locale,title:board.title,entities,relationships,intent:board.intent,interpretation:board.interpretation.trim()||preview};
}
export function semanticIdentity(board:Composition,locale:Locale) { return JSON.stringify(compileBrief(board,locale)); }

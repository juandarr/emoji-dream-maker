import {clamp,emptyComposition,parseComposition,type BoardNode,type BoardEdge,type Composition} from "./model";
import {selectionBounds,type WorldSize} from "./transforms";
import type {Point} from "./camera";

export type SelectionClipboard={kind:"emoji-playground-selection";version:1;nodes:BoardNode[];edges:BoardEdge[];world:WorldSize};
export function copySelection(board:Composition,ids:string[],world:WorldSize):SelectionClipboard|null {
  const picked=new Set(ids),nodes=board.nodes.filter(n=>picked.has(n.id));if(!nodes.length)return null;
  return {kind:"emoji-playground-selection",version:1,nodes:structuredClone(nodes),edges:structuredClone(board.edges.filter(e=>picked.has(e.source)&&picked.has(e.target))),world:{...world}};
}
export function readSelection(text:string):SelectionClipboard|null {
  try{
    if(text.length>512000)return null;
    const value=JSON.parse(text);
    if(value?.kind!=="emoji-playground-selection"||value.version!==1||!value.world||![value.world.width,value.world.height].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>0&&n<=100000))return null;
    const board=parseComposition({...emptyComposition(),nodes:value.nodes,edges:value.edges});
    return board.nodes.length?{kind:value.kind,version:1,nodes:board.nodes,edges:board.edges,world:value.world}:null;
  }catch{return null;}
}
/** Remap IDs and internal connections, retaining spacing in world pixels across viewport sizes. */
export function pasteSelection(clip:SelectionClipboard,world:WorldSize,center:Point,newId:()=>string):{nodes:BoardNode[];edges:BoardEdge[]} {
  const bounds=selectionBounds(clip.nodes,clip.world)!;
  const origin={x:(bounds.left+bounds.right)/2,y:(bounds.top+bounds.bottom)/2};
  const ids=new Map(clip.nodes.map(n=>[n.id,newId()]));
  return {nodes:clip.nodes.map(n=>({...n,id:ids.get(n.id)!,x:clamp((n.x/100*clip.world.width-origin.x+center.x)/world.width*100),y:clamp((n.y/100*clip.world.height-origin.y+center.y)/world.height*100)})),edges:clip.edges.map(e=>({...e,id:newId(),source:ids.get(e.source)!,target:ids.get(e.target)!}))};
}

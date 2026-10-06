"use client";

import {useEffect,useRef,type CSSProperties} from "react";
import {BringToFront,ChevronDown,ChevronUp,ChevronsDown,ChevronsUp,Copy,ClipboardPaste,Layers,X} from "lucide-react";
import type {Locale} from "@/lib/types";
import {arrangeNodes,type ArrangeDirection,type BoardNode} from "./model";
import {playgroundLabels} from "./labels";
import ToolbarTooltip from "./ToolbarTooltip";

type Props={nodes:BoardNode[];selectedIds:string[];locale:Locale;onCopy:()=>void;onPaste:()=>void;canPaste:boolean;onArrange:(direction:ArrangeDirection)=>void;layersOpen:boolean;onLayers:()=>void};
export function CanvasActions({nodes,selectedIds,locale,onCopy,onPaste,canPaste,onArrange,layersOpen,onLayers}:Props){
  const t=playgroundLabels[locale];
  const arrangeRef=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const dismiss=(e:PointerEvent)=>{if(arrangeRef.current&&!arrangeRef.current.contains(e.target as Node))arrangeRef.current.open=false;};
    document.addEventListener("pointerdown",dismiss);return()=>document.removeEventListener("pointerdown",dismiss);
  },[]);
  const actions=[{direction:"front",label:t.toFront,Icon:ChevronsUp},{direction:"forward",label:t.forward,Icon:ChevronUp},{direction:"backward",label:t.backward,Icon:ChevronDown},{direction:"back",label:t.toBack,Icon:ChevronsDown}] as const;
  return <div className="pg-edit-tools">
    <div className="pg-action-group pg-clipboard-tools" role="group" aria-label={t.clipboardTools}>
      <ToolbarTooltip label={t.copySelectionHint} shortcut="C"><button aria-label={t.copySelection} aria-keyshortcuts="Control+C Meta+C" disabled={!selectedIds.length} onClick={onCopy}><Copy size={16}/></button></ToolbarTooltip>
      <ToolbarTooltip label={t.pasteSelectionHint} shortcut="V"><button aria-label={t.pasteSelection} aria-keyshortcuts="Control+V Meta+V" disabled={!canPaste} onClick={onPaste}><ClipboardPaste size={16}/></button></ToolbarTooltip>
    </div>
    <div className="pg-action-group pg-layer-tools" role="group" aria-label={t.layerTools}>
    <details ref={arrangeRef} className="pg-arrange" onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();e.currentTarget.open=false;e.currentTarget.querySelector("summary")?.focus();}}}>
      <ToolbarTooltip asChild label={t.arrangeHint}><summary aria-label={t.arrange}><BringToFront size={16}/><ChevronDown size={10}/></summary></ToolbarTooltip>
      <div className="pg-arrange-menu" aria-label={t.arrange}>{actions.map(({direction,label,Icon})=><button key={direction} disabled={!selectedIds.length||arrangeNodes(nodes,selectedIds,direction).every((n,i)=>n.id===nodes[i].id)} onClick={e=>{onArrange(direction);const details=e.currentTarget.closest("details")!;details.open=false;details.querySelector("summary")?.focus();}}><Icon size={16}/>{label}</button>)}</div>
    </details>
    <ToolbarTooltip label={t.layersHint}><button aria-label={t.layers} aria-expanded={layersOpen} aria-controls="pg-layers" onClick={onLayers}><Layers size={16}/></button></ToolbarTooltip>
    </div>
  </div>;
}
export function LayerPanel({style,nodes,selectedIds,locale,onSelect,onClose}:{style:CSSProperties;nodes:BoardNode[];selectedIds:string[];locale:Locale;onSelect:(ids:string[])=>void;onClose:()=>void}){
  const t=playgroundLabels[locale];
  return <aside style={style} id="pg-layers" className="pg-layers" aria-label={t.layers} onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();onClose();}}}>
    <div className="pg-layers-heading"><div><h2>{t.layers}</h2><p>{t.frontToBack}</p></div><button aria-label={t.closeLayers} onClick={onClose}><X size={16}/></button></div>
    {nodes.length?<ol>{[...nodes].reverse().map((node,index)=><li key={node.id}><button aria-label={`${t.selectLayer} ${node.meaning}`} aria-pressed={selectedIds.includes(node.id)} onClick={e=>onSelect(e.shiftKey?selectedIds.includes(node.id)?selectedIds.filter(id=>id!==node.id):[...selectedIds,node.id]:[node.id])}><span aria-hidden="true">{node.glyph}</span><span>{node.meaning}</span><small>{index===0?t.front:index===nodes.length-1?t.back:""}</small></button></li>)}</ol>:<p className="pg-layer-empty">{t.emptyLayers}</p>}
  </aside>;
}

"use client";

import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from "react";
import {useDroppable} from "@dnd-kit/core";
import {Expand,Minimize,Plus,Scan,Trash2,X,ZoomIn,ZoomOut} from "lucide-react";
import {clamp,type BoardNode,type Composition} from "./model";
import {playgroundLabels} from "./labels";
import EmojiArtwork from "./emoji-artwork";
import type {Locale} from "@/lib/types";
import {fitCamera,GLYPH_SIZE,maxZoom,MIN_ZOOM,zoomAt,type Camera,type Point} from "./camera";

export type CanvasGeometry={camera:Camera;width:number;height:number};
type Props={board:Composition;locale:Locale;selectedId:string|null;onSelect:(id:string|null)=>void;onUpdate:(id:string,patch:Partial<BoardNode>)=>void;onRemove:(id:string)=>void;onAdd:()=>void;picker:ReactNode;overlay:ReactNode;toolbar:ReactNode;boardRef:React.RefObject<HTMLDivElement|null>;geometryRef:React.RefObject<CanvasGeometry>;pickerOpen:boolean;setPickerOpen:(value:boolean)=>void};
function ObjectEmoji({node,selected,zoom,width,height,onSelect,onMove,onDrag}: {node:BoardNode;selected:boolean;zoom:number;width:number;height:number;onSelect:()=>void;onMove:(patch:Partial<BoardNode>)=>void;onDrag:(value:boolean)=>void}) {
  const gesture=useRef<{id:number;start:Point;moved:boolean}|null>(null);
  const [offset,setOffset]=useState<Point>({x:0,y:0});
  const [dragged,setDragged]=useState(false);
  function finish(e:PointerEvent<HTMLButtonElement>,cancel=false) {
    const g=gesture.current;if(!g||g.id!==e.pointerId)return;
    gesture.current=null;
    if(g.moved&&!cancel)onMove({x:clamp(node.x+(e.clientX-g.start.x)/zoom/width*100),y:clamp(node.y+(e.clientY-g.start.y)/zoom/height*100)});
    if(!g.moved&&!cancel)onSelect();
    setOffset({x:0,y:0});setDragged(false);onDrag(false);
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  return <button className={`pg-node ${selected?"selected":""} ${dragged?"dragging":""}`} aria-label={`${node.glyph} ${node.meaning}`} aria-pressed={selected} data-glyph={node.glyph} style={{width:60*zoom,height:60*zoom,left:`${node.x}%`,top:`${node.y}%`,transform:`translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`}}
    onPointerDown={e=>{if(e.button!==0||!e.isPrimary)return;e.stopPropagation();e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);gesture.current={id:e.pointerId,start:{x:e.clientX,y:e.clientY},moved:false};}}
    onPointerMove={e=>{const g=gesture.current;if(!g||g.id!==e.pointerId)return;const dx=e.clientX-g.start.x,dy=e.clientY-g.start.y;if(!g.moved&&Math.hypot(dx,dy)>=6){g.moved=true;setDragged(true);onDrag(true);}if(g.moved)setOffset({x:dx,y:dy});}}
    onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>{if(gesture.current)finish(e,true);}}
    onClick={e=>{if(e.detail===0)onSelect();}}
    onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();onSelect();}else if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();onMove({x:clamp(node.x+(e.key==="ArrowRight"?2:e.key==="ArrowLeft"?-2:0)),y:clamp(node.y+(e.key==="ArrowDown"?2:e.key==="ArrowUp"?-2:0))});}}}>
    <span style={{fontSize:GLYPH_SIZE*zoom}}><EmojiArtwork glyph={node.glyph}/></span>
  </button>;
}
export default function Canvas({board,locale,selectedId,onSelect,onUpdate,onRemove,onAdd,picker,overlay,toolbar,boardRef,geometryRef,pickerOpen,setPickerOpen}:Props) {
  const t=playgroundLabels[locale];
  const stageRef=useRef<HTMLDivElement|null>(null),pickerButton=useRef<HTMLButtonElement|null>(null),wasPickerOpen=useRef(false);
  const {setNodeRef,isOver}=useDroppable({id:"composition-board"});
  const [camera,setCamera]=useState<Camera>({x:0,y:0,zoom:1}),[size,setSize]=useState({width:600,height:500});
  const [world,setWorld]=useState({width:600,height:500});
  const cameraRef=useRef(camera),sizeRef=useRef(size);
  const [fullscreen,setFullscreen]=useState(false),[panning,setPanning]=useState(false),[objectDragging,setObjectDragging]=useState(false);
  const pan=useRef<{id:number;start:Point;camera:Camera}|null>(null);
  cameraRef.current=camera;sizeRef.current=size;
  geometryRef.current={camera,width:world.width,height:world.height};
  useEffect(()=>{
    const el=boardRef.current;if(!el)return;
    let initialized=false;
    const observer=new ResizeObserver(()=>{
      const width=el.clientWidth,height=el.clientHeight;if(!width||!height)return;
      if(!initialized){initialized=true;setWorld({width,height});setCamera({x:0,y:0,zoom:1});}
      else {const old=sizeRef.current;setCamera(c=>zoomAt({...c,x:c.x+(width-old.width)/2,y:c.y+(height-old.height)/2},{x:width/2,y:height/2},Math.min(c.zoom,maxZoom(width,height))));}
      sizeRef.current={width,height};setSize({width,height});
    });observer.observe(el);return()=>observer.disconnect();
  },[boardRef]);
  useEffect(()=>{
    const el=boardRef.current;if(!el)return;
    function wheel(e:WheelEvent) {
      // Floating controls keep their own scrolling; the white canvas owns zoom.
      if(objectDragging||pan.current)return;
      e.preventDefault();const rect=el!.getBoundingClientRect();
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?rect.height:1);
      const zoom=Math.min(maxZoom(rect.width,rect.height),Math.max(MIN_ZOOM,cameraRef.current.zoom*Math.exp(-delta*.002)));
      setCamera(zoomAt(cameraRef.current,{x:e.clientX-rect.left,y:e.clientY-rect.top},zoom));
    }
    el.addEventListener("wheel",wheel,{passive:false});return()=>el.removeEventListener("wheel",wheel);
  },[boardRef,objectDragging]);
  useEffect(()=>{
    if(pickerOpen){stageRef.current?.scrollIntoView({block:"nearest",behavior:"instant"});stageRef.current?.querySelector<HTMLInputElement>(".pg-search input")?.focus({preventScroll:true});}
    else if(wasPickerOpen.current)pickerButton.current?.focus({preventScroll:true});
    wasPickerOpen.current=pickerOpen;
  },[pickerOpen]);
  useEffect(()=>{
    if(!fullscreen)return;
    const overflow=document.body.style.overflow;document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=overflow;};
  },[fullscreen]);
  useEffect(()=>{
    function change(){if(!document.fullscreenElement)setFullscreen(false);}
    document.addEventListener("fullscreenchange",change);return()=>document.removeEventListener("fullscreenchange",change);
  },[]);
  async function toggleFullscreen() {
    if(fullscreen){if(document.fullscreenElement)await document.exitFullscreen();setFullscreen(false);}
    else {setFullscreen(true);try{await stageRef.current?.requestFullscreen?.();}catch{/* Viewport focus mode also works where native fullscreen is unavailable. */}}
  }
  function zoomButton(factor:number) {setCamera(c=>zoomAt(c,{x:size.width/2,y:size.height/2},Math.max(MIN_ZOOM,Math.min(maxZoom(size.width,size.height),c.zoom*factor))));}
  function fit() {setCamera(fitCamera(board.nodes.map(n=>({x:n.x/100*world.width,y:n.y/100*world.height})),size.width,size.height));}
  const selected=board.nodes.find(n=>n.id===selectedId);
  const selectedPoint=selected?{x:camera.x+selected.x/100*world.width*camera.zoom,y:camera.y+selected.y/100*world.height*camera.zoom}:null;
  return <div ref={stageRef} className={`pg-stage ${fullscreen?"is-fullscreen":""} ${objectDragging?"object-dragging":""}`} role={fullscreen?"dialog":undefined} aria-modal={fullscreen?true:undefined} aria-label={fullscreen?t.canvas:undefined}
    onKeyDown={e=>{
      if(e.key==="Escape"){e.preventDefault();onSelect(null);if(pickerOpen){setPickerOpen(false);pickerButton.current?.focus();}else if(fullscreen&&!document.fullscreenElement){setFullscreen(false);pickerButton.current?.focus();}}
      const target=e.target as HTMLElement;
      if((e.key==="Delete"||e.key==="Backspace")&&selected&&!target.matches("input,textarea,select,[contenteditable=true]")){e.preventDefault();onRemove(selected.id);}
      if(fullscreen&&e.key==="Tab") {const focusable=Array.from(stageRef.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')).filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    }}>
    <div className="pg-space-toolbar"><button ref={pickerButton} className="pg-picker-toggle" aria-label={t.openPicker} aria-expanded={pickerOpen} onClick={()=>setPickerOpen(!pickerOpen)}><Plus size={17}/><span>{t.addEmoji}</span></button><div className="pg-space-history">{toolbar}</div><div className="pg-view-tools"><button aria-label={t.zoomOut} title={t.zoomOut} disabled={camera.zoom<=MIN_ZOOM} onClick={()=>zoomButton(1/1.3)}><ZoomOut size={17}/></button><output aria-label={t.zoomLevel}>{Math.round(camera.zoom*100)}%</output><button aria-label={t.zoomIn} title={t.zoomIn} disabled={camera.zoom>=maxZoom(size.width,size.height)} onClick={()=>zoomButton(1.3)}><ZoomIn size={17}/></button><button aria-label={t.fit} title={t.fit} onClick={fit}><Scan size={17}/></button><button aria-label={fullscreen?t.exitFullscreen:t.fullscreen} title={fullscreen?t.exitFullscreen:t.fullscreen} onClick={()=>void toggleFullscreen()}>{fullscreen?<Minimize size={17}/>:<Expand size={17}/>}</button></div></div>
    <div ref={el=>{setNodeRef(el);boardRef.current=el;}} role="region" aria-label={t.canvas} tabIndex={0} className={`pg-board ${isOver?"over":""} ${panning?"panning":""}`} onPointerDown={e=>{
      if(e.button!==0||!e.isPrimary)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);pan.current={id:e.pointerId,start:{x:e.clientX,y:e.clientY},camera:cameraRef.current};setPanning(true);
    }} onPointerMove={e=>{const g=pan.current;if(g?.id===e.pointerId)setCamera({...g.camera,x:g.camera.x+e.clientX-g.start.x,y:g.camera.y+e.clientY-g.start.y});}} onPointerUp={e=>{if(pan.current?.id===e.pointerId){pan.current=null;setPanning(false);e.currentTarget.releasePointerCapture(e.pointerId);}}} onPointerCancel={()=>{pan.current=null;setPanning(false);}} onLostPointerCapture={()=>{pan.current=null;setPanning(false);}}>
      {/* Render at display size: scaling a cached composited layer can blur even SVGs. */}
      <div className="pg-world" style={{width:world.width*camera.zoom,height:world.height*camera.zoom,transform:`translate(${camera.x}px, ${camera.y}px)`}}>
        <svg className="pg-edges" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="pg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a68cf4"/></marker></defs>{board.edges.map(e=>{const a=board.nodes.find(n=>n.id===e.source)!,b=board.nodes.find(n=>n.id===e.target)!;return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b9a4e0" strokeWidth=".35" markerEnd="url(#pg-arrow)"/>;})}</svg>
        {board.nodes.map(node=><ObjectEmoji key={node.id} node={node} selected={selectedId===node.id} zoom={camera.zoom} width={world.width} height={world.height} onSelect={()=>onSelect(selectedId===node.id?null:node.id)} onMove={patch=>onUpdate(node.id,patch)} onDrag={value=>{setObjectDragging(value);if(value)onSelect(null);}}/>)}
      </div>
      {!board.nodes.length&&<div className="pg-empty"><span>🌱</span><h2>{t.empty}</h2><p>{t.emptyHint}</p><button onPointerDown={e=>e.stopPropagation()} onClick={onAdd}><Plus size={16}/>{t.addEmoji}</button></div>}
      {selectedPoint&&!objectDragging&&selectedPoint.x>=0&&selectedPoint.x<=size.width&&selectedPoint.y>=0&&selectedPoint.y<=size.height&&<button className="pg-object-delete" aria-label={t.deleteObject} title={t.deleteObject} style={{left:Math.max(18,Math.min(size.width-18,selectedPoint.x+GLYPH_SIZE/2*camera.zoom+10)),top:Math.max(18,Math.min(size.height-18,selectedPoint.y-GLYPH_SIZE/2*camera.zoom-10))}} onPointerDown={e=>e.stopPropagation()} onClick={()=>onRemove(selected!.id)}><Trash2 size={14}/></button>}
      <div className="pg-space-caption" aria-hidden="true">{t.spaceHint}</div>
    </div>
    {pickerOpen&&<div className="pg-floating-library pg-panel" role="dialog" aria-label={t.library}><div className="pg-picker-heading"><h2><Plus size={16}/>{t.library}</h2><button aria-label={t.closePicker} onClick={()=>{setPickerOpen(false);pickerButton.current?.focus();}}><X size={16}/></button></div>{picker}<p className="pg-emoji-credit"><a href="https://github.com/googlefonts/noto-emoji/tree/v2.051" target="_blank" rel="noreferrer">Noto Emoji</a> · <a href="https://openfontlicense.org/" target="_blank" rel="noreferrer">OFL 1.1</a></p></div>}
    {overlay}
  </div>;
}

"use client";

import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from "react";
import {useDroppable} from "@dnd-kit/core";
import {Expand,Minimize,Plus,Scan,MousePointer2,MoveDiagonal2,RotateCw,Trash2,X,ZoomIn,ZoomOut} from "lucide-react";
import {type BoardNode,type Composition} from "./model";
import {playgroundLabels} from "./labels";
import EmojiArtwork from "./emoji-artwork";
import type {Locale} from "@/lib/types";
import {fitCamera,GLYPH_SIZE,maxZoom,MIN_ZOOM,worldPoint,zoomAt,type Camera,type Point} from "./camera";

import {intersectedNodes,resizeCursor,rotatePoint,selectionBounds,selectionFrame,transformNodes,type Bounds,type SelectionFrame} from "./transforms";

export type CanvasGeometry={camera:Camera;width:number;height:number};
type Props={board:Composition;locale:Locale;selectedIds:string[];onSelect:(ids:string[])=>void;onTransform:(nodes:BoardNode[])=>void;onRemove:(ids:string[])=>void;onAdd:()=>void;picker:ReactNode;overlay:ReactNode;toolbar:ReactNode;boardRef:React.RefObject<HTMLDivElement|null>;geometryRef:React.RefObject<CanvasGeometry>;pickerOpen:boolean;setPickerOpen:(value:boolean)=>void};
type ObjectGesture={id:number;kind:"move"|"resize"|"rotate";start:Point;nodes:BoardNode[];preview:BoardNode[];center:Point;moved:boolean;keepSelection:boolean;lastAngle:number;angle:number;element:HTMLElement;clickId:string|null;additive:boolean;frame:SelectionFrame};
export default function Canvas({board,locale,selectedIds,onSelect,onTransform,onRemove,onAdd,picker,overlay,toolbar,boardRef,geometryRef,pickerOpen,setPickerOpen}:Props) {
  const t=playgroundLabels[locale];
  const stageRef=useRef<HTMLDivElement|null>(null),pickerButton=useRef<HTMLButtonElement|null>(null),wasPickerOpen=useRef(false);
  const {setNodeRef,isOver}=useDroppable({id:"composition-board"});
  const [camera,setCamera]=useState<Camera>({x:0,y:0,zoom:1}),[size,setSize]=useState({width:600,height:500});
  const [world,setWorld]=useState({width:600,height:500});
  const cameraRef=useRef(camera),sizeRef=useRef(size);
  const [fullscreen,setFullscreen]=useState(false),[panning,setPanning]=useState(false),[objectDragging,setObjectDragging]=useState(false);
  const pan=useRef<{id:number;start:Point;camera:Camera;moved:boolean;selecting:boolean;additive:boolean;selection:string[]}|null>(null);
  const gesture=useRef<ObjectGesture|null>(null);
  const [preview,setPreview]=useState<BoardNode[]|null>(null),[area,setArea]=useState<Bounds|null>(null),[selectMode,setSelectMode]=useState(false),[shiftPressed,setShiftPressed]=useState(false);
  const nodes=board.nodes.map(n=>preview?.find(p=>p.id===n.id)||n);
  const selected=nodes.filter(n=>selectedIds.includes(n.id));
  function localPoint(client:Point):Point {const rect=boardRef.current!.getBoundingClientRect();return {x:client.x-rect.left,y:client.y-rect.top};}
  function point(client:Point):Point {return worldPoint(localPoint(client),cameraRef.current);}
  function selectObject(id:string,additive=false) {onSelect(additive?selectedIds.includes(id)?selectedIds.filter(v=>v!==id):[...selectedIds,id]:selectedIds.length===1&&selectedIds[0]===id?[]:[id]);}
  function startObject(e:PointerEvent<HTMLElement>,node:BoardNode|null,kind:ObjectGesture["kind"]) {
    if(e.button!==0||!e.isPrimary||pan.current||gesture.current)return;
    e.stopPropagation();e.preventDefault();
    const group=node?(selectedIds.includes(node.id)&&selectedIds.length>1?selected:[node]):selected;
    const frame=selectionFrame(group,world);if(!frame)return;
    (node||kind!=="move"?e.currentTarget:boardRef.current)?.focus({preventScroll:true});
    e.currentTarget.setPointerCapture(e.pointerId);
    const center=frame.center,p=point({x:e.clientX,y:e.clientY});
    gesture.current={id:e.pointerId,kind,start:p,nodes:group,preview:group,center,moved:false,keepSelection:kind!=="move"||!node||selectedIds.includes(node.id),lastAngle:Math.atan2(p.y-center.y,p.x-center.x),angle:0,element:e.currentTarget,clickId:node?.id??null,additive:e.shiftKey,frame};
  }
  function moveObject(e:PointerEvent<HTMLElement>) {
    const g=gesture.current;if(!g||g.id!==e.pointerId)return;
    const p=point({x:e.clientX,y:e.clientY}),dx=p.x-g.start.x,dy=p.y-g.start.y;
    if(!g.moved&&Math.hypot(dx,dy)*cameraRef.current.zoom<6)return;
    if(!g.moved){g.moved=true;setObjectDragging(true);if(!g.keepSelection)onSelect([]);}
    if(g.kind==="move")g.preview=transformNodes(g.nodes,world,g.center,{dx,dy});
    else if(g.kind==="resize"){
      const delta=rotatePoint({x:dx,y:dy},-g.frame.rotation),half={x:g.frame.width/2,y:g.frame.height/2};
      const factor=1+(delta.x*half.x+delta.y*half.y)/Math.max(1,half.x*half.x+half.y*half.y);
      g.preview=transformNodes(g.nodes,world,g.center,{factor});
    }
    else {const angle=Math.atan2(p.y-g.center.y,p.x-g.center.x);g.angle+=Math.atan2(Math.sin(angle-g.lastAngle),Math.cos(angle-g.lastAngle));g.lastAngle=angle;g.preview=transformNodes(g.nodes,world,g.center,{angle:g.angle*180/Math.PI});}
    setPreview(g.preview);
  }
  function finishObject(e?:PointerEvent<HTMLElement>,cancel=false) {
    const g=gesture.current;if(!g||e&&g.id!==e.pointerId)return;
    gesture.current=null;
    if(g.moved&&!cancel)onTransform(g.preview);
    else if(!cancel&&g.kind==="move"&&g.clickId)selectObject(g.clickId,g.additive);
    setPreview(null);setObjectDragging(false);
    if(g.element.hasPointerCapture(g.id))g.element.releasePointerCapture(g.id);
  }
  function keyTransform(kind:"resize"|"rotate",e:React.KeyboardEvent<HTMLButtonElement>) {
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;
    e.preventDefault();const frame=selectionFrame(selected,world);if(!frame)return;
    const positive=e.key==="ArrowRight"||e.key==="ArrowUp";
    onTransform(transformNodes(selected,world,frame.center,kind==="resize"?{factor:positive?1.1:1/1.1}:{angle:(positive?1:-1)*(e.shiftKey?15:5)}));
  }
  cameraRef.current=camera;sizeRef.current=size;
  geometryRef.current={camera,width:world.width,height:world.height};
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.key==="Shift")setShiftPressed(event.shiftKey);};
    const reset=()=>setShiftPressed(false);
    const visibility=()=>{if(document.hidden)reset();};
    window.addEventListener("keydown",key);window.addEventListener("keyup",key);window.addEventListener("blur",reset);document.addEventListener("visibilitychange",visibility);
    return()=>{window.removeEventListener("keydown",key);window.removeEventListener("keyup",key);window.removeEventListener("blur",reset);document.removeEventListener("visibilitychange",visibility);};
  },[]);
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
      if(gesture.current||pan.current)return;
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
  function fit() {const b=selectionBounds(board.nodes,world);setCamera(fitCamera(b?[{x:b.left,y:b.top},{x:b.right,y:b.bottom}]:[],size.width,size.height));}
  const frame=selectionFrame(selected,world);
  const screenFrame=frame?{center:{x:camera.x+frame.center.x*camera.zoom,y:camera.y+frame.center.y*camera.zoom},width:frame.width*camera.zoom+16,height:frame.height*camera.zoom+16,rotation:frame.rotation}:null;
  function framePoint(x:number,y:number) {
    const delta=rotatePoint({x,y},screenFrame!.rotation);
    return {left:screenFrame!.center.x+delta.x,top:screenFrame!.center.y+delta.y};
  }
  function controlPoint(x:number,y:number) {
    const p=framePoint(x,y);
    return {left:Math.max(18,Math.min(size.width-18,p.left)),top:Math.max(18,Math.min(size.height-18,p.top))};
  }
  const frameStyle=screenFrame?{left:screenFrame.center.x,top:screenFrame.center.y,width:screenFrame.width,height:screenFrame.height,transform:`translate(-50%, -50%) rotate(${screenFrame.rotation}deg)`}:undefined;
  const rotationAnchor=screenFrame?framePoint(0,-screenFrame.height/2):null;
  const rotationControl=screenFrame?controlPoint(0,-screenFrame.height/2-30):null;
  const visibleBounds=selectionBounds(selected,world);
  const selectionVisible=visibleBounds&&(gesture.current||camera.x+visibleBounds.right*camera.zoom>=0&&camera.x+visibleBounds.left*camera.zoom<=size.width&&camera.y+visibleBounds.bottom*camera.zoom>=0&&camera.y+visibleBounds.top*camera.zoom<=size.height);
  return <div ref={stageRef} className={`pg-stage ${fullscreen?"is-fullscreen":""} ${objectDragging?`transforming ${gesture.current?.kind==="move"?"object-dragging":gesture.current?.kind==="resize"?"resizing":"rotating"}`:""}`} style={{"--pg-resize-cursor":resizeCursor(screenFrame?.rotation??0)} as React.CSSProperties} role={fullscreen?"dialog":undefined} aria-modal={fullscreen?true:undefined} aria-label={fullscreen?t.canvas:undefined}
    onKeyDown={e=>{
      if(e.key==="Escape"){e.preventDefault();finishObject(undefined,true);pan.current=null;setPanning(false);setArea(null);onSelect([]);if(pickerOpen){setPickerOpen(false);pickerButton.current?.focus();}else if(fullscreen&&!document.fullscreenElement){setFullscreen(false);pickerButton.current?.focus();}}
      const target=e.target as HTMLElement;
      if((e.key==="Delete"||e.key==="Backspace")&&selected.length&&!target.matches("input,textarea,select,[contenteditable=true]")){e.preventDefault();onRemove(selected.map(n=>n.id));}
      if(fullscreen&&e.key==="Tab") {const focusable=Array.from(stageRef.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')).filter(el=>el.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    }}>
    <div className="pg-space-toolbar"><button ref={pickerButton} className="pg-picker-toggle" aria-label={t.openPicker} aria-expanded={pickerOpen} onClick={()=>setPickerOpen(!pickerOpen)}><Plus size={17}/><span>{t.addEmoji}</span></button><div className="pg-space-history">{toolbar}</div><div className="pg-view-tools"><button className="pg-selection-tool" aria-label={t.selectArea} title={t.selectAreaHint} aria-pressed={selectMode} onClick={()=>setSelectMode(!selectMode)}><MousePointer2 size={17}/><span>{t.selectArea}</span></button><button aria-label={t.zoomOut} title={t.zoomOut} disabled={camera.zoom<=MIN_ZOOM} onClick={()=>zoomButton(1/1.3)}><ZoomOut size={17}/></button><output aria-label={t.zoomLevel}>{Math.round(camera.zoom*100)}%</output><button aria-label={t.zoomIn} title={t.zoomIn} disabled={camera.zoom>=maxZoom(size.width,size.height)} onClick={()=>zoomButton(1.3)}><ZoomIn size={17}/></button><button aria-label={t.fit} title={t.fit} onClick={fit}><Scan size={17}/></button><button aria-label={fullscreen?t.exitFullscreen:t.fullscreen} title={fullscreen?t.exitFullscreen:t.fullscreen} onClick={()=>void toggleFullscreen()}>{fullscreen?<Minimize size={17}/>:<Expand size={17}/>}</button></div></div>
    <div ref={el=>{setNodeRef(el);boardRef.current=el;}} role="region" aria-label={t.canvas} tabIndex={0} className={`pg-board ${isOver?"over":""} ${panning?"panning":""} ${selectMode?"select-mode":""} ${shiftPressed?"shift-select":""}`} onPointerEnter={e=>setShiftPressed(e.shiftKey)} onPointerDown={e=>{
      if(e.button!==0||!e.isPrimary||gesture.current)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);
      const selecting=selectMode||e.shiftKey;pan.current={id:e.pointerId,start:{x:e.clientX,y:e.clientY},camera:cameraRef.current,moved:false,selecting,additive:e.shiftKey,selection:selectedIds};
      if(selecting){const p=localPoint({x:e.clientX,y:e.clientY});setArea({left:p.x,right:p.x,top:p.y,bottom:p.y});}else setPanning(true);
    }} onPointerMove={e=>{
      const g=pan.current;if(g?.id!==e.pointerId)return;
      const dx=e.clientX-g.start.x,dy=e.clientY-g.start.y;if(Math.hypot(dx,dy)>=6)g.moved=true;
      if(g.selecting){const a=localPoint(g.start),b=localPoint({x:e.clientX,y:e.clientY});setArea({left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)});}
      else setCamera({...g.camera,x:g.camera.x+dx,y:g.camera.y+dy});
    }} onPointerUp={e=>{
      const g=pan.current;if(g?.id!==e.pointerId)return;pan.current=null;setPanning(false);setArea(null);
      // Account for subpixel layout rounding at the painted edge; tolerance stays 1/32 CSS px.
      if(g.selecting&&g.moved){const a=point(g.start),b=point({x:e.clientX,y:e.clientY});const ids=intersectedNodes(board.nodes,{left:Math.min(a.x,b.x),right:Math.max(a.x,b.x),top:Math.min(a.y,b.y),bottom:Math.max(a.y,b.y)},world,1/(32*cameraRef.current.zoom));onSelect(g.additive?[...new Set([...g.selection,...ids])]:ids);}
      else if(!g.moved)onSelect([]);
      if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    }} onPointerCancel={()=>{pan.current=null;setPanning(false);setArea(null);}} onLostPointerCapture={()=>{pan.current=null;setPanning(false);setArea(null);}}>
      {screenFrame&&selectionVisible&&<div className="pg-selection-drag" aria-hidden="true" style={frameStyle}
        onPointerDown={e=>{if(!e.shiftKey)startObject(e,null,"move");}} onPointerMove={moveObject} onPointerUp={e=>finishObject(e)} onPointerCancel={e=>finishObject(e,true)} onLostPointerCapture={e=>finishObject(e,true)}/>}
      {/* Render at display size: scaling a cached composited layer can blur even vector artwork. */}
      <div className="pg-world" style={{width:world.width*camera.zoom,height:world.height*camera.zoom,transform:`translate(${camera.x}px, ${camera.y}px)`}}>
        <svg className="pg-edges" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="pg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a68cf4"/></marker></defs>{board.edges.map(e=>{const a=nodes.find(n=>n.id===e.source)!,b=nodes.find(n=>n.id===e.target)!;return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b9a4e0" strokeWidth=".35" markerEnd="url(#pg-arrow)"/>;})}</svg>
        {nodes.map(node=><button key={node.id} data-id={node.id} data-glyph={node.glyph} data-scale={node.scale} data-rotation={node.rotation} className={`pg-node ${selectedIds.includes(node.id)?"selected":""} ${objectDragging&&preview?.some(p=>p.id===node.id)?"dragging":""}`} aria-label={`${node.glyph} ${node.meaning}`} aria-pressed={selectedIds.includes(node.id)} style={{width:60*camera.zoom*node.scale,height:60*camera.zoom*node.scale,left:`${node.x}%`,top:`${node.y}%`,transform:`translate(-50%, -50%) rotate(${node.rotation}deg)`}}
          onPointerDown={e=>startObject(e,node,"move")} onPointerMove={moveObject} onPointerUp={e=>finishObject(e)} onPointerCancel={e=>finishObject(e,true)} onLostPointerCapture={e=>finishObject(e,true)}
          onClick={e=>{if(e.detail===0)selectObject(node.id,e.shiftKey);}}
          onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectObject(node.id,e.shiftKey);}else if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();const group=selectedIds.includes(node.id)?selected:[node];onTransform(transformNodes(group,world,{x:0,y:0},{dx:e.key==="ArrowRight"?world.width*.02:e.key==="ArrowLeft"?-world.width*.02:0,dy:e.key==="ArrowDown"?world.height*.02:e.key==="ArrowUp"?-world.height*.02:0}));}}}>
          <span style={{fontSize:GLYPH_SIZE*camera.zoom*node.scale}}><EmojiArtwork glyph={node.glyph}/></span>
        </button>)}
      </div>
      {!board.nodes.length&&<div className="pg-empty"><span>🌱</span><h2>{t.empty}</h2><p>{t.emptyHint}</p><button onPointerDown={e=>e.stopPropagation()} onClick={onAdd}><Plus size={16}/>{t.addEmoji}</button></div>}
      {area&&<div className="pg-selection-area" aria-hidden="true" style={{left:area.left,top:area.top,width:area.right-area.left,height:area.bottom-area.top}}/>}
      {selected.length>1&&<output className="pg-selection-count" aria-live="polite">{t.groupSelected.replace("{count}",String(selected.length))}</output>}
      {screenFrame&&selectionVisible&&<>
        <svg className="pg-selection-connector" aria-hidden="true" viewBox={`0 0 ${size.width} ${size.height}`}><line x1={rotationAnchor!.left} y1={rotationAnchor!.top} x2={rotationControl!.left} y2={rotationControl!.top}/></svg>
        <div className="pg-group-bounds pg-selection-bounds" data-rotation={screenFrame.rotation} data-center-x={screenFrame.center.x} data-center-y={screenFrame.center.y} aria-hidden="true" style={frameStyle}/>
        <button className="pg-object-delete" aria-label={selected.length===1?t.deleteObject:t.deleteGroup} title={selected.length===1?t.deleteObject:t.deleteGroup} style={controlPoint(screenFrame.width/2+12,-screenFrame.height/2-12)} onPointerDown={e=>e.stopPropagation()} onClick={()=>onRemove(selected.map(n=>n.id))}><Trash2 size={14}/></button>
        <button className="pg-transform-handle resize" aria-label={t.resizeSelection} title={t.resizeHint} style={{...controlPoint(screenFrame.width/2+12,screenFrame.height/2+12),cursor:resizeCursor(screenFrame.rotation)}} onPointerDown={e=>startObject(e,null,"resize")} onPointerMove={moveObject} onPointerUp={e=>finishObject(e)} onPointerCancel={e=>finishObject(e,true)} onLostPointerCapture={e=>finishObject(e,true)} onKeyDown={e=>keyTransform("resize",e)}><MoveDiagonal2 size={15} style={{transform:`rotate(${screenFrame.rotation}deg)`}}/></button>
        <button className="pg-transform-handle rotate" aria-label={t.rotateSelection} title={t.rotateHint} style={rotationControl!} onPointerDown={e=>startObject(e,null,"rotate")} onPointerMove={moveObject} onPointerUp={e=>finishObject(e)} onPointerCancel={e=>finishObject(e,true)} onLostPointerCapture={e=>finishObject(e,true)} onKeyDown={e=>keyTransform("rotate",e)}><RotateCw size={15} style={{transform:`rotate(${screenFrame.rotation}deg)`}}/></button>
      </>}

      <div className="pg-space-caption" aria-hidden="true">{selectMode?t.selectAreaHint:t.spaceHint}</div>
    </div>
    {pickerOpen&&<div className="pg-floating-library pg-panel" role="dialog" aria-label={t.library}><div className="pg-picker-heading"><h2><Plus size={16}/>{t.library}</h2><button aria-label={t.closePicker} onClick={()=>{setPickerOpen(false);pickerButton.current?.focus();}}><X size={16}/></button></div>{picker}<p className="pg-emoji-credit"><a href="https://github.com/googlefonts/noto-emoji/tree/v2.051" target="_blank" rel="noreferrer">Noto Emoji</a> · <a href="https://openfontlicense.org/" target="_blank" rel="noreferrer">OFL 1.1</a></p></div>}
    {overlay}
  </div>;
}

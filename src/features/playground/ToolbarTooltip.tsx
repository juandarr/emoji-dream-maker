"use client";

import {cloneElement,useEffect,useId,useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactElement,type Ref} from "react";
import {createPortal} from "react-dom";

/** Shared hover and keyboard descriptions, positioned safely inside the viewport. */
export default function ToolbarTooltip({label,shortcut,children,asChild=false}:{label:string;shortcut?:string;children:ReactElement<HTMLAttributes<HTMLElement>&{ref?:Ref<HTMLElement>}>;asChild?:boolean}){
  const id=useId(),anchor=useRef<HTMLElement|null>(null),tooltip=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [open,setOpen]=useState(false),[mac,setMac]=useState(false),[position,setPosition]=useState({left:0,top:0});
  useEffect(()=>{setMac(/Mac|iPhone|iPad/.test(navigator.platform));return()=>{if(timer.current)clearTimeout(timer.current);};},[]);
  function hide(){if(timer.current)clearTimeout(timer.current);timer.current=null;setOpen(false);}
  function leave(){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(hide,150);}
  function show(immediate=false){if(timer.current)clearTimeout(timer.current);if(immediate)setOpen(true);else timer.current=setTimeout(()=>setOpen(true),450);}
  useLayoutEffect(()=>{
    if(!open||!anchor.current||!tooltip.current)return;
    const a=anchor.current.getBoundingClientRect(),t=tooltip.current.getBoundingClientRect();
    const left=Math.max(8,Math.min(innerWidth-t.width-8,a.left+a.width/2-t.width/2));
    const top=a.top-t.height-8>=8?a.top-t.height-8:Math.min(innerHeight-t.height-8,a.bottom+8);
    setPosition({left,top});
  },[open,label,shortcut,mac]);
  useEffect(()=>{
    if(!open)return;
    window.addEventListener("resize",hide);document.addEventListener("scroll",hide,true);
    return()=>{window.removeEventListener("resize",hide);document.removeEventListener("scroll",hide,true);};
  },[open]);
  const container=open?(anchor.current?.closest(".pg-stage.is-fullscreen")??document.body):null;
  const events:HTMLAttributes<HTMLElement>={onPointerEnter:e=>{if(e.pointerType!=="touch")show();},onPointerLeave:leave,onFocusCapture:e=>{if(e.target instanceof Element&&e.target.matches(":focus-visible"))show(true);},onBlurCapture:hide,onClickCapture:hide,onPointerDownCapture:hide,onKeyDownCapture:e=>{if(e.key==="Escape")hide();}};
  const description={"aria-describedby":open?[children.props["aria-describedby"],id].filter(Boolean).join(" "):children.props["aria-describedby"]};
  const trigger=asChild?cloneElement(children,{...events,...description,ref:el=>{anchor.current=el;}}):<span ref={el=>{anchor.current=el;}} className="pg-tooltip-trigger" {...events}>{cloneElement(children,description)}</span>;
  return <>{trigger}{container&&createPortal(<div ref={tooltip} id={id} className="pg-toolbar-tooltip" role="tooltip" style={position} onPointerEnter={()=>show(true)} onPointerLeave={leave}><span>{label}</span>{shortcut&&<kbd>{mac?"Cmd":"Ctrl"}+{shortcut}</kbd>}</div>,container)}</>;
}

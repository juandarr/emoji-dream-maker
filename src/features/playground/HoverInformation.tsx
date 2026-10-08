"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

/** Shared hover behavior for information icons; clicks and focus never pin it open. */
export default function HoverInformation({label,id,className,panelClassName="",role="tooltip",issue=false,children}:{label:string;id:string;className:string;panelClassName?:string;role?:"tooltip"|"dialog";issue?:boolean;children:ReactNode}) {
  const [open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const cancelClose=useCallback(()=>{if(closeTimer.current!==null){clearTimeout(closeTimer.current);closeTimer.current=null;}},[]);
  const dismiss=useCallback(()=>{cancelClose();setOpen(false);},[cancelClose]);
  useEffect(()=>()=>cancelClose(),[cancelClose]);
  useEffect(()=>{
    if(!open)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))dismiss();};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.stopPropagation();if(root.current?.contains(document.activeElement)||document.activeElement===document.body)trigger.current?.focus();dismiss();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};
  },[open,dismiss]);
  return <div ref={root} className={className} onPointerEnter={event=>{if(event.pointerType==="touch")return;cancelClose();setOpen(true);}} onPointerLeave={()=>{cancelClose();closeTimer.current=setTimeout(()=>setOpen(false),200);}}>
    <button type="button" ref={trigger} className={`pg-info-trigger ${issue?"has-issue":""}`} aria-label={label} aria-expanded={open} aria-controls={id} aria-describedby={role==="tooltip"&&open?id:undefined} aria-haspopup={role==="dialog"?"dialog":undefined}><Info size={17}/>{issue&&<span className="pg-info-status" aria-hidden="true"/>}</button>
    <div id={id} className={`pg-generation-summary ${panelClassName}`} role={role} aria-label={role==="dialog"?label:undefined} hidden={!open}>{children}</div>
  </div>;
}

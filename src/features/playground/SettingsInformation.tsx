"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { Locale } from "@/lib/types";
import { playgroundLabels } from "./labels";
import type { GenerationConfig } from "./CreationHeader";

export default function SettingsInformation({locale,config,configFailed,onCheck,onCopy,canCopy}:{locale:Locale;config:GenerationConfig|null;configFailed:boolean;onCheck:()=>void;onCopy:()=>void;canCopy:boolean}) {
  const t=playgroundLabels[locale];
  const name=locale==="es"?"Información de ajustes":"Settings information";
  const [open,setOpen]=useState(false),[pinned,setPinned]=useState(false);
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const cancelClose=()=>{if(closeTimer.current!==null){clearTimeout(closeTimer.current);closeTimer.current=null;}};
  useEffect(()=>()=>cancelClose(),[]);
  const issue=configFailed||!!config&&!config.configured;
  useEffect(()=>{
    if(!open)return;
    const dismiss=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){cancelClose();setOpen(false);setPinned(false);}};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.stopPropagation();cancelClose();if(pinned)trigger.current?.focus();setOpen(false);setPinned(false);}};
    document.addEventListener("pointerdown",dismiss);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",escape);};
  },[open,pinned]);
  return <div ref={root} className="pg-settings-info-wrap"
    onMouseEnter={()=>{cancelClose();setOpen(true);}}
    onMouseLeave={()=>{cancelClose();if(!pinned&&!root.current?.contains(document.activeElement))closeTimer.current=setTimeout(()=>setOpen(false),200);}}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget)){setOpen(false);setPinned(false);}}}
    onKeyDown={event=>{if(event.key==="Escape"&&open){event.preventDefault();event.stopPropagation();trigger.current?.focus();setOpen(false);setPinned(false);}}}>
    <button ref={trigger} className={`pg-settings-info-trigger ${issue?"has-issue":""}`} aria-label={name} aria-expanded={open} aria-controls="pg-settings-information" aria-haspopup="dialog" onFocus={()=>{cancelClose();setOpen(true);}} onClick={()=>{cancelClose();const next=!pinned;setPinned(next);setOpen(next);}}><Info size={17}/>{issue&&<span className="pg-info-status" aria-hidden="true"/>}</button>
    <div id="pg-settings-information" className="pg-generation-summary pg-settings-information" role="dialog" aria-label={name} hidden={!open}>
      <div className="pg-settings-information-scroll">
      <h3>{locale==="es"?"Antes de generar":"Before you generate"}</h3>
      <p>{t.cap.replace("{tokens}",(config?.maxOutputTokens||8192).toLocaleString(locale))}</p>
      <p>{t.mediaHint}</p><p>{t.sending}</p>
      <p>{locale==="es"?"Al actualizar la página se reinician el lienzo y el resultado actual. Las creaciones guardadas permanecen en tu estante.":"Refreshing starts a new canvas and clears the current result. Saved creations stay on your story shelf."}</p>
      <div className="pg-settings-connection"><p role="status">{configFailed?t.checkFailed:!config?t.checking:config.configured?t.connected:t.setup}</p>{(!config||!config.configured||configFailed)&&<button className="pg-link" disabled={!config&&!configFailed} onClick={()=>{trigger.current?.focus();onCheck();}}>{t.check}</button>}</div>
      <button className="pg-link" disabled={!canCopy} onClick={onCopy}>{t.localMessage}</button>
      </div>
    </div>
  </div>;
}

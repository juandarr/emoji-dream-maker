"use client";

import {useLayoutEffect,useMemo,useRef} from "react";
import {useDraggable} from "@dnd-kit/core";
import {ChevronLeft,ChevronRight,Search} from "lucide-react";
import {categories,searchCatalog} from "@/lib/catalog";
import {emojisForSubject,subjects} from "@/lib/subjects";
import type {EmojiRecord,Locale} from "@/lib/types";
import {playgroundLabels} from "./labels";
import EmojiArtwork from "./emoji-artwork";

export type PickerState={query:string;category:number|null;sort:string;page:number;subject:string|null};
export const initialPickerState:PickerState={query:"",category:null,sort:"relevance",page:0,subject:null};
function PaletteEmoji({emoji,locale,onAdd,disabled}:{emoji:EmojiRecord;locale:Locale;onAdd:()=>void;disabled:boolean}){
  const {setNodeRef,attributes,listeners,isDragging}=useDraggable({id:`tray:${emoji.id}`,disabled});
  const t=playgroundLabels[locale];
  return <button ref={setNodeRef} {...attributes} {...listeners} disabled={disabled} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();onAdd();}else listeners?.onKeyDown?.(event);}} onClick={onAdd} aria-label={`${t.add} ${emoji.labels[locale]}`} title={emoji.labels[locale]} className={`pg-palette-emoji ${isDragging?"dragging":""}`}><span><EmojiArtwork glyph={emoji.glyph}/></span><small>{emoji.labels[locale]}</small></button>;
}
export default function EmojiPicker({locale,state,onChange,onAdd,disabled,sceneEmojiIds}:{locale:Locale;state:PickerState;onChange:(state:PickerState)=>void;onAdd:(emoji:EmojiRecord)=>void;disabled:boolean;sceneEmojiIds:string[]}){
  const t=playgroundLabels[locale],{query,category,sort,page,subject}=state;
  const paletteRef=useRef<HTMLDivElement|null>(null);
  const update=(patch:Partial<PickerState>)=>onChange({...state,page:0,...patch});
  const matches=useMemo(()=>{
    let result=searchCatalog(query,category);
    if(subject){const ids=new Set(emojisForSubject(subject).map(e=>e.id));result=result.filter(e=>ids.has(e.id));}
    if(!query&&sort==="relevance"){
      const used=new Set(sceneEmojiIds),scores=new Map<string,number>();
      for(const subject of subjects){const collection=emojisForSubject(subject.id),weight=collection.filter(e=>used.has(e.id)).length;
        if(weight)for(const emoji of collection)scores.set(emoji.id,(scores.get(emoji.id)||0)+weight);
      }
      // Stable sorting retains the existing balanced catalog when the scene has
      // no related subjects. Search ranking and explicit sorts stay untouched.
      result.sort((a,b)=>(scores.get(b.id)||0)-(scores.get(a.id)||0)||Number(used.has(a.id))-Number(used.has(b.id)));
    }
    if(sort==="alphabetical")result.sort((a,b)=>a.labels[locale].localeCompare(b.labels[locale],locale));
    if(sort==="unicode")result.sort((a,b)=>{
      const left=Array.from(a.glyph,c=>c.codePointAt(0)!),right=Array.from(b.glyph,c=>c.codePointAt(0)!);
      for(let i=0;i<Math.min(left.length,right.length);i++)if(left[i]!==right[i])return left[i]-right[i];
      return left.length-right.length;
    });
    return result;
  },[query,category,sort,locale,subject,sceneEmojiIds]);
  const pages=Math.max(1,Math.ceil(matches.length/30)),currentPage=Math.min(page,pages-1),visible=matches.slice(currentPage*30,(currentPage+1)*30);
  useLayoutEffect(()=>{paletteRef.current?.scrollTo({top:0,left:0,behavior:"instant"});},[currentPage,query,category,subject,sort,locale]);
  return <>
    <label className="pg-search"><Search size={16}/><input aria-label={t.search} placeholder={locale==="es"?"océano, amor, 🌙…":"ocean, love, 🌙…"} value={query} maxLength={150} onChange={e=>update({query:e.target.value})}/></label>
    <div className="pg-filters pg-picker-dropdowns">
      <label>{t.category}<select aria-label={t.category} value={category??"all"} onChange={e=>update({category:e.target.value==="all"?null:Number(e.target.value),subject:null})}><option value="all">{t.anyFilter}</option>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c[locale]}</option>)}</select></label>
      <label>{t.subjectFilter}<select aria-label={t.subjects} value={subject??"all"} onChange={e=>update({subject:e.target.value==="all"?null:e.target.value,category:null})}><option value="all">{t.anyFilter}</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.icon} {s.labels[locale]}</option>)}</select></label>
      <label>{t.sortFilter}<select aria-label={t.sort} value={sort} onChange={e=>update({sort:e.target.value})}><option value="relevance">{t.relevance}</option><option value="alphabetical">{t.alphabetical}</option><option value="unicode">{t.unicode}</option></select></label>
    </div>
    <div id="pg-picker-results" className="pg-picker-results">
      <div ref={paletteRef} className="pg-palette">{visible.map(emoji=><PaletteEmoji key={emoji.id} emoji={emoji} locale={locale} onAdd={()=>onAdd(emoji)} disabled={disabled}/>)}{!visible.length&&<p role="status">{t.noMatches}</p>}</div>
    </div>
    <div className="pg-paging"><span aria-live="polite">{(matches.length===1?t.pickerCountOne:t.pickerCount).replace("{count}",matches.length.toLocaleString(locale)).replace("{page}",String(currentPage+1)).replace("{pages}",String(pages))}</span><div><button aria-label={t.previous} disabled={currentPage===0} onClick={()=>onChange({...state,page:currentPage-1})}><ChevronLeft size={17}/></button><button aria-label={t.next} disabled={currentPage===pages-1} onClick={()=>onChange({...state,page:currentPage+1})}><ChevronRight size={17}/></button></div></div>
  </>;
}

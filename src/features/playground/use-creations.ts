"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CREATIONS_CHANGED } from "./creation-repository";
import type { Collection, CreationRecord, CreationState } from "./creations";
import { useAccount } from "@/features/account/AccountWorkspace";
import type { UndoReceipt } from "@/features/account/creation-repository";

export function useCreations() {
  const account=useAccount(),repository=account.repository,namespace=account.identity.id;
  const [temporary,setTemporary]=useState<CreationRecord[]>([]),[saved,setSaved]=useState<CreationRecord[]>([]);
  const [ready,setReady]=useState(false),[error,setError]=useState(false),[writing,setWriting]=useState(false);
  const loadVersion=useRef(0),pendingWrites=useRef(0);
  const refresh=useCallback(async()=>{const version=++loadVersion.current;try{const [t,s]=await Promise.all([repository.list("temporary"),repository.list("saved")]);if(version===loadVersion.current){setTemporary(t);setSaved(s);setError(false);}return {temporary:t,saved:s};}catch{if(version===loadVersion.current)setError(true);}finally{if(version===loadVersion.current)setReady(true);}},[repository]);
  useEffect(()=>{void refresh();const listener=(event:Event)=>{if((event as CustomEvent).detail===namespace)void refresh();};window.addEventListener(CREATIONS_CHANGED,listener);window.addEventListener("focus",refresh);const channel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel(CREATIONS_CHANGED):null;if(channel)channel.onmessage=event=>{if(event.data===namespace)void refresh();};return()=>{loadVersion.current++;window.removeEventListener(CREATIONS_CHANGED,listener);window.removeEventListener("focus",refresh);channel?.close();};},[refresh,namespace]);
  const mutate=useCallback(async<T,>(operation:()=>Promise<T>)=>{if(!ready||error)throw new Error("Creation history must load before writing");pendingWrites.current++;setWriting(true);try{const result=await operation();await refresh();return result;}finally{pendingWrites.current--;setWriting(pendingWrites.current>0);}},[refresh,ready,error]);
  return {temporary,saved,ready,error,writing,refresh,
    put:(collection:Collection,state:CreationState,revision?:number)=>mutate(()=>repository.put(collection,state,revision)),
    remove:(collection:Collection,records:CreationRecord[])=>mutate(()=>repository.remove(collection,records)),
    undo:(receipt:UndoReceipt)=>mutate(()=>repository.undo(receipt))};
}

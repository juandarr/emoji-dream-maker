"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserCreationRepository, CREATIONS_CHANGED } from "./creation-repository";
import type { Collection, CreationRecord, CreationState } from "./creations";

export function useCreations(namespace="local") {
  const repository=useMemo(()=>browserCreationRepository(namespace),[namespace]);
  const [temporary,setTemporary]=useState<CreationRecord[]>([]),[saved,setSaved]=useState<CreationRecord[]>([]);
  const [ready,setReady]=useState(false),[error,setError]=useState(false),[writing,setWriting]=useState(false);
  const loadVersion=useRef(0),pendingWrites=useRef(0);
  const refresh=useCallback(async()=>{const version=++loadVersion.current;try{const [t,s]=await Promise.all([repository.list("temporary"),repository.list("saved")]);if(version===loadVersion.current){setTemporary(t);setSaved(s);setError(false);}}catch{if(version===loadVersion.current)setError(true);}finally{setReady(true);}},[repository]);
  useEffect(()=>{void refresh();const listener=()=>void refresh();window.addEventListener(CREATIONS_CHANGED,listener);const channel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel(CREATIONS_CHANGED):null;if(channel)channel.onmessage=event=>{if(event.data===namespace)void refresh();};return()=>{loadVersion.current++;window.removeEventListener(CREATIONS_CHANGED,listener);channel?.close();};},[refresh,namespace]);
  const mutate=useCallback(async<T,>(operation:()=>Promise<T>)=>{pendingWrites.current++;setWriting(true);try{const result=await operation();await refresh();return result;}finally{pendingWrites.current--;setWriting(pendingWrites.current>0);}},[refresh]);
  return {temporary,saved,ready,error,writing,refresh,
    put:(collection:Collection,state:CreationState,revision?:number)=>mutate(()=>repository.put(collection,state,revision)),
    remove:(collection:Collection,records:CreationRecord[])=>mutate(()=>repository.remove(collection,records))};
}

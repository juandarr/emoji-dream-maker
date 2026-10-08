"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import Explorer from "@/components/Explorer";
import { CreationConflict } from "@/features/playground/creation-repository";
import { CreationDialog } from "@/features/playground/CreationHistory";
import type { Preferences } from "@/lib/storage";
import type { GenerationSettings } from "@/features/generation/model";
import { readResponse } from "./client";
import { accountCreationRepository } from "./creation-repository";
import { type AccountData, type AccountIdentity } from "./model";
import "./account.css";
type Protection=(next:()=>void)=>void;
type Workspace={identity:AccountIdentity;preferences:Preferences;setPreferences:Dispatch<SetStateAction<Preferences>>;playground:GenerationSettings|null;setPlayground:(settings:GenerationSettings)=>void;request:(url:string,init?:RequestInit)=>Promise<Response>;repository:ReturnType<typeof accountCreationRepository>;registerProtection:(handler:Protection,cancelGeneration:()=>Promise<void>)=>()=>void;logout:()=>void;initialSavedCount:number};
const Context=createContext<Workspace|null>(null);
export function useAccount(){const value=useContext(Context);if(!value)throw new Error("Account workspace is required");return value;}
export default function AccountWorkspace({identity,initialData,savedCount}:{identity:AccountIdentity;initialData:AccountData;savedCount:number}){
  const [logoutError,setLogoutError]=useState(false);
  const [data,setData]=useState(initialData),[version,setVersion]=useState(0),[saving,setSaving]=useState(false),[error,setError]=useState(""),[expired,setExpired]=useState(false),[logoutPending,setLogoutPending]=useState(false);
  const dataRef=useRef(data);dataRef.current=data;const versionRef=useRef(version);versionRef.current=version;
  const persisted=useRef(0),revision=useRef(initialData.revision),writing=useRef(false),blocked=useRef(false),alive=useRef(true),controller=useRef(new AbortController());
  const protect=useRef<Protection|null>(null),cancel=useRef<(()=>Promise<void>)|null>(null);
  useEffect(()=>{alive.current=true;controller.current=new AbortController();return()=>{alive.current=false;controller.current.abort();};},[]);
  const request=useCallback(async(url:string,init:RequestInit={})=>{const headers=new Headers(init.headers);headers.set("X-Account-Id",identity.id);const response=await fetch(url,{...init,headers,cache:"no-store",signal:AbortSignal.any([controller.current.signal,...(init.signal?[init.signal]:[])])});if(response.status===401||response.status===403&&(await response.clone().json()).code==="activation")setExpired(true);return response;},[identity.id]);
  const repository=useMemo(()=>accountCreationRepository(identity.id,request),[identity.id,request]);
  const setPreferences=useCallback<Dispatch<SetStateAction<Preferences>>>(next=>{setData(current=>({...current,preferences:typeof next==="function"?next(current.preferences):next}));setVersion(v=>v+1);},[]);
  const setPlayground=useCallback((settings:GenerationSettings)=>{setData(current=>({...current,playground:settings}));setVersion(v=>v+1);},[]);
  const persist=useCallback(async(force=false)=>{
    if(writing.current||!alive.current)return false;if(blocked.current&&!force)return false;
    writing.current=true;setSaving(true);blocked.current=false;
    try{while(persisted.current<versionRef.current){const target=versionRef.current,snapshot=dataRef.current;const next=await readResponse<AccountData>(await request("/api/account/state",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...snapshot,revision:revision.current})}));if(!alive.current)return false;revision.current=next.revision;persisted.current=target;setData(current=>({...current,revision:next.revision}));}setError("");return true;}
    catch(error){if(alive.current){blocked.current=true;setError(error instanceof CreationConflict?"conflict":"save");}return false;}
    finally{writing.current=false;if(alive.current)setSaving(false);}
  },[request]);
  useEffect(()=>{if(version>0)void persist();},[version,persist]);
  const reload=useCallback(async(reapply=false,discard=false)=>{try{const before=versionRef.current;const newest=await readResponse<AccountData>(await request("/api/account/state"));if(!alive.current||!reapply&&(before!==versionRef.current||!discard&&persisted.current!==versionRef.current))return;revision.current=newest.revision;if(reapply){blocked.current=false;await persist(true);}else{setData(newest);persisted.current=versionRef.current;blocked.current=false;setError("");}}catch{setError("save");}},[request,persist]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==="hidden"||writing.current||persisted.current!==versionRef.current)return;void reload();};const channel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel(`account-state:${identity.id}`):null;if(channel)channel.onmessage=refresh;window.addEventListener("focus",refresh);return()=>{channel?.close();window.removeEventListener("focus",refresh);};},[identity.id,reload]);
  useEffect(()=>{if(!saving&&persisted.current===version&&version>0){const c=typeof BroadcastChannel!=="undefined"?new BroadcastChannel(`account-state:${identity.id}`):null;c?.postMessage("changed");c?.close();}},[saving,version,identity.id]);
  const signOut=useCallback(async()=>{
    setLogoutError(false);
    try{await cancel.current?.();}catch{/* Logout stays available when cancellation delivery fails. */}
    controller.current.abort();
    try{const response=await fetch("/api/auth/sign-out",{method:"POST",headers:{"Content-Type":"application/json","X-Account-Id":identity.id},body:"{}",signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error();window.location.assign("/login");
    }catch{controller.current=new AbortController();setLogoutError(true);}
  },[identity.id]);
  const logout=useCallback(()=>{const next=()=>{if(writing.current||persisted.current!==versionRef.current)setLogoutPending(true);else void signOut();};if(protect.current)protect.current(next);else next();},[signOut]);
  const registerProtection=useCallback((handler:Protection,cancelGeneration:()=>Promise<void>)=>{protect.current=handler;cancel.current=cancelGeneration;return()=>{if(protect.current===handler){protect.current=null;cancel.current=null;}};},[]);
  const locale=data.preferences.locale,es=locale==="es";
  const context=useMemo<Workspace>(()=>({identity,preferences:data.preferences,setPreferences,playground:data.playground,setPlayground,request,repository,registerProtection,logout,initialSavedCount:savedCount}),[identity,data.preferences,data.playground,setPreferences,setPlayground,request,repository,registerProtection,logout,savedCount]);
  return <Context.Provider value={context}>
    <Explorer accountStatus={<>    {<div className="account-save-status" role="status">{saving?(es?"Guardando preferencias…":"Saving preferences…"):error==="conflict"?(es?"Las preferencias cambiaron en otra pestaña. Tus cambios siguen aquí.":"Preferences changed in another tab. Your changes are still here."):error?(es?"No se guardaron tus preferencias. Tus cambios siguen aquí.":"Your preferences could not be saved. Your changes are still here."):(es?"Preferencias guardadas":"Preferences saved")}{!saving&&error&&(error==="conflict"?<><button onClick={()=>void reload(true)}>{es?"Aplicar mis cambios":"Reapply my changes"}</button><button onClick={()=>void reload(false,true)}>{es?"Cargar versión actual":"Load latest"}</button></>:<button onClick={()=>void persist(true)}>{es?"Reintentar":"Retry"}</button>)}</div>}
{logoutError&&<p role="alert">{es?"No se pudo cerrar la sesión.":"Could not sign out."}<button onClick={()=>void signOut()}>{es?"Reintentar":"Retry"}</button></p>}</>}/>
    {logoutPending&&<CreationDialog locale={locale} title={es?"¿Guardar antes de salir?":"Save before signing out?"} onCancel={()=>setLogoutPending(false)}><p>{es?"Hay preferencias pendientes de guardar.":"You have preferences that have not been saved."}</p>{error&&<p role="alert">{es?"Resuelve el error de guardado antes de continuar.":"Resolve the save error before continuing."}</p>}<div className="cr-dialog-actions"><button disabled={saving} onClick={async()=>{if(await persist(true))void signOut();}}>{es?"Guardar y salir":"Save and sign out"}</button><button onClick={()=>void signOut()}>{es?"Descartar y salir":"Discard and sign out"}</button><button onClick={()=>setLogoutPending(false)}>{es?"Cancelar":"Cancel"}</button></div></CreationDialog>}
    {expired&&<CreationDialog locale={locale} title={es?"Sesión interrumpida":"Session interrupted"} onCancel={()=>setExpired(false)}><p>{es?"Se ha cerrado tu sesión. Los cambios sin guardar permanecen en esta vista mientras esté abierta; no se transferirán a otra cuenta.":"Your session ended. Unsaved changes remain in this view while it stays open; they will not transfer to another account."}</p><a href="/login">{es?"Volver a iniciar sesión":"Sign in again"}</a></CreationDialog>}
  </Context.Provider>;
}

import { makeState, parseState, stateIdentity, type Collection, type CreationRecord, type CreationState } from "./creations";
import { restoreRuns } from "./storage";

export interface CreationRepository {
  list(collection:Collection):Promise<CreationRecord[]>;
  put(collection:Collection,state:CreationState,expectedRevision?:number):Promise<CreationRecord>;
  remove(collection:Collection,records:CreationRecord[]):Promise<void>;
}
export class CreationConflict extends Error { constructor(){super("This experiment changed in another tab. Reload the history before trying again.");} }
export const CREATIONS_CHANGED="dream-maker-creations-changed";
const DB="dream-maker-playground-v1",STORE="creations",META="creation-meta";
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,2);r.onupgradeneeded=()=>{
  const db=r.result;if(!db.objectStoreNames.contains("workspace"))db.createObjectStore("workspace");
  if(!db.objectStoreNames.contains(STORE)){const s=db.createObjectStore(STORE,{keyPath:"key"});s.createIndex("membership",["namespace","collection"]);s.createIndex("identity",["namespace","collection","identity"],{unique:true});}
  if(!db.objectStoreNames.contains(META))db.createObjectStore(META);
};r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error("Close older app tabs to upgrade creation storage."));});}
function request<T>(r:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function recordIdentity(collection:Collection,state:CreationState){return collection==="temporary"&&state.run?.status!=="succeeded"?JSON.stringify({state:stateIdentity(state),attempt:state.run}):stateIdentity(state);}
async function digest(text:string){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");}
function announce(namespace:string){window.dispatchEvent(new CustomEvent(CREATIONS_CHANGED,{detail:namespace}));if(typeof BroadcastChannel!=="undefined"){const channel=new BroadcastChannel(CREATIONS_CHANGED);channel.postMessage(namespace);channel.close();}}

/** Collection operations, not editor autosave. Transactions preserve independent memberships. */
export function browserCreationRepository(namespace="local"):CreationRepository {
  const ongoing=new Set<string>();
  let migrated:Promise<void>|null=null;
  async function migrate(){if(migrated)return migrated;migrated=(async()=>{
    const db=await open();try{if(await request(db.transaction(META).objectStore(META).get(namespace)))return;
      const old=await request(db.transaction("workspace").objectStore("workspace").get("active"));
      const states=restoreRuns(old?.runs).map(run=>({...makeState(run.board,run.settings,run),id:`legacy-${run.id}`,createdAt:run.createdAt}));
      const rows=await Promise.all(states.map(async state=>({key:`${namespace}:temporary:${state.id}`,namespace,collection:"temporary" as const,identity:await digest(recordIdentity("temporary",state)),revision:1,state})));
      await new Promise<void>((resolve,reject)=>{const tx=db.transaction([STORE,META],"readwrite");const check=tx.objectStore(META).get(namespace);check.onsuccess=()=>{if(!check.result){rows.forEach(row=>tx.objectStore(STORE).put(row));tx.objectStore(META).put(true,namespace);}};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
    }finally{db.close();}
  })().catch(error=>{migrated=null;throw error;});return migrated;}
  return {
    async list(collection){await migrate();const db=await open();try{const rows=await request<CreationRecord[]>(db.transaction(STORE).objectStore(STORE).index("membership").getAll([namespace,collection]));return rows.flatMap(row=>{try{const state=parseState(row.state);if(state.run?.status==="running"&&!ongoing.has(row.key))state.run={...state.run,status:"unknown",errorCode:"interrupted"};return [{...row,state}];}catch{return [];}}).sort((a,b)=>b.state.createdAt-a.state.createdAt);}finally{db.close();}},
    async put(collection,input,expectedRevision){await migrate();const state=parseState(structuredClone(input));const identity=await digest(recordIdentity(collection,state));const key=`${namespace}:${collection}:${state.id}`;const db=await open();
      try{const row=await new Promise<CreationRecord>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE);let result:CreationRecord;let failure:Error|null=null;
        const current=store.get(key);current.onsuccess=()=>{const old=current.result as CreationRecord|undefined;if(expectedRevision!==undefined&&old?.revision!==expectedRevision){failure=new CreationConflict();tx.abort();return;}
          if(old&&collection==="saved"&&old.identity!==identity){failure=new CreationConflict();tx.abort();return;}
          const duplicate=store.index("identity").get([namespace,collection,identity]);duplicate.onsuccess=()=>{if(duplicate.result&&duplicate.result.key!==key){result=duplicate.result;return;}result={key,namespace,collection,identity,revision:(old?.revision||0)+1,state};store.put(result);};};
        tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure||tx.error||new Error("Could not save creation"));tx.onerror=()=>reject(tx.error);
      });if(row.state.run?.status==="running")ongoing.add(row.key);else ongoing.delete(row.key);announce(namespace);return row;}finally{db.close();}},
    async remove(collection,records){await migrate();const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE);let failure:Error|null=null;for(const row of records){if(row.namespace!==namespace||row.collection!==collection){failure=new CreationConflict();tx.abort();break;}const r=store.get(row.key);r.onsuccess=()=>{if(r.result&&r.result.revision!==row.revision){failure=new CreationConflict();tx.abort();}else store.delete(row.key);};}tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure||tx.error);tx.onerror=()=>reject(tx.error);});announce(namespace);}finally{db.close();}}
  };
}

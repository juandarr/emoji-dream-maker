import type { CreationRepository } from "@/features/playground/creation-repository";
import { CREATIONS_CHANGED } from "@/features/playground/creation-repository";
import type { Collection, CreationRecord, CreationState } from "@/features/playground/creations";
import { readResponse } from "./client";
export type UndoReceipt={token:string;expiresAt:number;count:number};
export type AccountCreationRepository=Omit<CreationRepository,"remove"> & {remove:(collection:Collection,records:CreationRecord[])=>Promise<UndoReceipt>;undo:(receipt:UndoReceipt)=>Promise<CreationRecord[]>};
export function announceAccount(namespace:string){window.dispatchEvent(new CustomEvent(CREATIONS_CHANGED,{detail:namespace}));const channel=typeof BroadcastChannel!=="undefined"?new BroadcastChannel(CREATIONS_CHANGED):null;channel?.postMessage(namespace);channel?.close();}
export function accountCreationRepository(namespace:string,request:(url:string,init?:RequestInit)=>Promise<Response>):AccountCreationRepository{
  const mutate=async<T>(url:string,body:unknown,method:string)=>{const result=await readResponse<T>(await request(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}));announceAccount(namespace);return result;};
  return {list:async collection=>readResponse<CreationRecord[]>(await request(`/api/account/creations?collection=${collection}`)),
    put:(collection:Collection,state:CreationState,revision?:number)=>mutate<CreationRecord>("/api/account/creations",{collection,state,revision},"PUT"),
    remove:(collection,records)=>mutate<UndoReceipt>("/api/account/creations",{collection,records:records.map(r=>({key:r.key,revision:r.revision}))},"DELETE"),
    undo:receipt=>mutate<CreationRecord[]>("/api/account/undo",{token:receipt.token},"POST")};
}

import "server-only";
import { randomUUID } from "node:crypto";
import { canSaveState, containsWork, canvasIdentity, configurationIdentity, parseState, saveableState, stateIdentity, type Collection, type CreationRecord, type CreationState } from "@/features/playground/creations";
import type { GenerationRun } from "@/features/generation/model";
import { runProvenance } from "./provenance";
import { database } from "./database";
import { AccountError, hash } from "./http";
export type CreationRow={owner:string;collection:Collection;id:string;identity:string;revision:number;created_at:number;updated_at:number;payload:string|null;deleted_at:number|null;undo_token:string|null;undo_until:number|null};
export function record(row:CreationRow):CreationRecord{if(!row.payload)throw new AccountError("deleted",410);return {key:`${row.collection}:${row.id}`,namespace:row.owner,collection:row.collection,identity:row.identity,revision:row.revision,updatedAt:row.updated_at||row.created_at,state:parseState(JSON.parse(row.payload))};}
export function collection(value:unknown):Collection{if(value!=="saved"&&value!=="temporary")throw new AccountError("validation");return value;}
export function creationIdentity(scope:Collection,state:CreationState){return hash(scope==="temporary"&&state.run?.status!=="succeeded"?JSON.stringify({state:stateIdentity(state),attempt:state.run}):stateIdentity(state));}
export function cleanupDeleted(){
  const db=database(),now=Date.now();
  db.prepare("UPDATE creations SET payload=NULL,undo_token=NULL,undo_until=NULL WHERE deleted_at IS NOT NULL AND undo_until<?").run(now);
  // A terminal deleted attempt keeps its ID/fingerprint, but not removed authored content.
  const attempts=db.prepare("SELECT owner,id FROM attempts WHERE status!='running' AND payload IS NOT NULL").all() as {owner:string;id:string}[];
  for(const a of attempts){const referenced=db.prepare("SELECT 1 FROM creations WHERE owner=? AND payload IS NOT NULL AND json_extract(payload,'$.run.id')=? LIMIT 1").get(a.owner,a.id);if(!referenced)db.prepare("UPDATE attempts SET payload=NULL,outcome=NULL WHERE owner=? AND id=?").run(a.owner,a.id);}
}
function validateState(owner:string,value:unknown){
  let state:CreationState;try{state=parseState(value);if((value as CreationState)?.run&&!state.run)throw new Error();}catch{throw new AccountError("validation");}
  if(state.run){
    const attempt=database().prepare("SELECT payload,status,provenance FROM attempts WHERE owner=? AND id=?").get(owner,state.run.id) as {payload:string|null;status:string;provenance:string|null}|undefined;
    if(!attempt)throw new AccountError("provenance",403);
    if(!attempt.payload){
      if(state.run.status!==attempt.status||!attempt.provenance||runProvenance(state.run)!==attempt.provenance)throw new AccountError("provenance",403);
      return state;
    }
    const original=JSON.parse(attempt.payload) as GenerationRun,r=state.run;
    if(r.status!==original.status||canvasIdentity(r.board)!==canvasIdentity(original.board)||configurationIdentity(r.board,r.settings)!==configurationIdentity(original.board,original.settings)||JSON.stringify(r.brief)!==JSON.stringify(original.brief)||r.identity!==original.identity||r.createdAt!==original.createdAt||!!r.result!==!!original.result)throw new AccountError("provenance",403);
    state={...state,run:{...original,...(original.result&&r.result?{result:{...original.result,text:r.result.text,title:r.result.title}}:{})}};
  }
  return state;
}
export function listCreations(owner:string,scope:Collection){cleanupDeleted();return (database().prepare("SELECT * FROM creations WHERE owner=? AND collection=? AND deleted_at IS NULL ORDER BY created_at DESC,id").all(owner,scope) as CreationRow[]).map(record);}
export function putCreation(owner:string,scope:Collection,value:unknown,expectedRevision?:unknown,internal=false){
  const parsed=internal?parseState(value):validateState(owner,value);if(scope==="saved"?!canSaveState(parsed):!containsWork(parsed))throw new AccountError("validation");const state=scope==="saved"?saveableState(parsed):parsed,identity=creationIdentity(scope,state),db=database();
  if(expectedRevision!==undefined&&(!Number.isSafeInteger(expectedRevision)||Number(expectedRevision)<1))throw new AccountError("validation");
  return db.transaction(()=>{
    const old=db.prepare("SELECT * FROM creations WHERE owner=? AND collection=? AND id=?").get(owner,scope,state.id) as CreationRow|undefined;
    if(old?.deleted_at!==null&&old!==undefined)throw new AccountError("deleted",409);
    if(expectedRevision!==undefined&&old?.revision!==expectedRevision)throw new AccountError("conflict",409);
    if(old&&old.identity===identity)return record(old);
    if(old&&(scope==="saved"||expectedRevision===undefined))throw new AccountError("conflict",409);
    const duplicate=db.prepare("SELECT * FROM creations WHERE owner=? AND collection=? AND identity=? AND deleted_at IS NULL").get(owner,scope,identity) as CreationRow|undefined;
    if(duplicate&&duplicate.id!==state.id)return record(duplicate);
    const next={...state,createdAt:old?.created_at||Date.now()},revision=(old?.revision||0)+1;
    db.prepare("INSERT INTO creations(owner,collection,id,identity,revision,created_at,payload,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner,collection,id) DO UPDATE SET identity=excluded.identity,revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at").run(owner,scope,next.id,identity,revision,next.createdAt,JSON.stringify(next),Date.now());
    return record(db.prepare("SELECT * FROM creations WHERE owner=? AND collection=? AND id=?").get(owner,scope,next.id) as CreationRow);
  })();
}
export function removeCreations(owner:string,scope:Collection,values:unknown){
  if(!Array.isArray(values)||!values.length)throw new AccountError("validation");
  const db=database(),token=randomUUID(),until=Date.now()+5000;
  const rows=db.transaction(()=>{
    const rows=values.map(value=>{if(!value||typeof value.key!=="string"||!Number.isSafeInteger(value.revision))throw new AccountError("validation");const id=value.key.startsWith(`${scope}:`)?value.key.slice(scope.length+1):"";const row=db.prepare("SELECT * FROM creations WHERE owner=? AND collection=? AND id=? AND deleted_at IS NULL").get(owner,scope,id) as CreationRow|undefined;if(!row||row.revision!==value.revision)throw new AccountError("conflict",409);return row;});
    if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new AccountError("validation");
    for(const row of rows)db.prepare("UPDATE creations SET deleted_at=?,undo_token=?,undo_until=?,updated_at=? WHERE owner=? AND collection=? AND id=?").run(Date.now(),hash(token),until,Date.now(),owner,scope,row.id);return rows;
  })();return {token,expiresAt:until,count:rows.length};
}
export function undoRemoval(owner:string,token:unknown){
  if(typeof token!=="string"||token.length>100)throw new AccountError("validation");const db=database();
  return db.transaction(()=>{const rows=db.prepare("SELECT * FROM creations WHERE owner=? AND undo_token=? AND deleted_at IS NOT NULL").all(owner,hash(token)) as CreationRow[];
    if(!rows.length||rows.some(row=>!row.payload||!row.undo_until||row.undo_until<Date.now()))throw new AccountError("undo-expired",409);
    for(const row of rows){if(db.prepare("SELECT 1 FROM creations WHERE owner=? AND collection=? AND identity=? AND deleted_at IS NULL").get(owner,row.collection,row.identity))throw new AccountError("conflict",409);db.prepare("UPDATE creations SET deleted_at=NULL,undo_token=NULL,undo_until=NULL,revision=revision+1,updated_at=? WHERE owner=? AND collection=? AND id=?").run(Date.now(),owner,row.collection,row.id);}
    return rows.map(row=>record(db.prepare("SELECT * FROM creations WHERE owner=? AND collection=? AND id=?").get(owner,row.collection,row.id) as CreationRow));
  })();
}

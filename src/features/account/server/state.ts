import "server-only";
import { emptyAccountData, validateAccountData, type AccountData } from "../model";
import { database } from "./database";
import { AccountError } from "./http";
export function readAccountData(owner:string):AccountData{
  const row=database().prepare("SELECT revision,payload FROM account_state WHERE owner=?").get(owner) as {revision:number;payload:string}|undefined;
  return row?{...validateAccountData(JSON.parse(row.payload)),revision:row.revision}:emptyAccountData();
}
export function writeAccountData(owner:string,value:unknown,revision:unknown){
  let data;try{data=validateAccountData(value);}catch{throw new AccountError("validation");}
  if(!Number.isSafeInteger(revision)||Number(revision)<0)throw new AccountError("validation");
  const db=database();return db.transaction(()=>{const current=readAccountData(owner);if(current.revision!==revision)throw new AccountError("conflict",409);
    const next={...data,revision:current.revision+1};db.prepare("INSERT INTO account_state(owner,revision,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at").run(owner,next.revision,JSON.stringify(data),Date.now());return next;
  })();
}

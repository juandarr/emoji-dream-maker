import "server-only";
import { compileBrief, semanticIdentity, type Composition } from "@/features/playground/model";
import { type GenerationRun, type GenerationSettings } from "@/features/generation/model";
import { generationConfig, GenerationError, openRouterGenerator } from "@/features/generation/server/openrouter";
import { creationIdentity, record, type CreationRow } from "./creations";
import { runProvenance } from "./provenance";
import { database } from "./database";
import { AccountError, equalSecret, hash, takeLimit } from "./http";
export type GenerationOutcome={status:number;code?:string;error?:string;result?:GenerationRun["result"];run?:GenerationRun;persistencePending?:boolean};
type Attempt={owner:string;id:string;fingerprint:string|null;token_hash:string;status:string;created_at:number;payload:string|null;outcome:string|null};
type Job={controller:AbortController;promise:Promise<GenerationOutcome>;pending?:GenerationOutcome;cancel?:(outcome:GenerationOutcome)=>void};
const globalJobs=globalThis as typeof globalThis & { emojiJobs?:{path:string;jobs:Map<string,Job>;active:number;recent:number[]} };
function runtime(){const db=database(),path=db.name;if(globalJobs.emojiJobs?.path===path)return globalJobs.emojiJobs;const runtime={path,jobs:new Map<string,Job>(),active:0,recent:[] as number[]};
  const interrupted=db.prepare("SELECT * FROM attempts WHERE status='running'").all() as Attempt[];
  for(const a of interrupted)if(a.payload){const run={...JSON.parse(a.payload),status:"unknown",errorCode:"interrupted"} as GenerationRun;persist(a.owner,a.id,{status:502,code:"unknown",run,error:"Generation was interrupted. This request will not retry automatically."});}
  globalJobs.emojiJobs=runtime;return runtime;
}
function persist(owner:string,id:string,outcome:GenerationOutcome){
  const db=database();return db.transaction(()=>{
    const attempt=db.prepare("SELECT * FROM attempts WHERE owner=? AND id=?").get(owner,id) as Attempt;
    if(attempt.status==="canceled")return attempt.outcome?JSON.parse(attempt.outcome) as GenerationOutcome:{status:409,code:"canceled"};
    const run=outcome.run!,next={...outcome,result:run.result};
    db.prepare("UPDATE attempts SET status=?,payload=?,outcome=?,provenance=?,updated_at=? WHERE owner=? AND id=?").run(run.status,JSON.stringify(run),JSON.stringify(next),runProvenance(run),Date.now(),owner,id);
    const rows=db.prepare("SELECT * FROM creations WHERE owner=? AND collection='temporary' AND json_extract(payload,'$.run.id')=? AND (deleted_at IS NULL OR undo_until>=?)").all(owner,id,Date.now()) as CreationRow[];
    for(const row of rows){const state={...JSON.parse(row.payload!),run};db.prepare("UPDATE creations SET identity=?,revision=revision+1,payload=?,updated_at=? WHERE owner=? AND collection='temporary' AND id=?").run(creationIdentity("temporary",state),JSON.stringify(state),Date.now(),owner,row.id);}
    return next;
  })();
}
export function initializeGenerations(){runtime();}
export function attemptStatus(owner:string,id:string){runtime();const a=database().prepare("SELECT * FROM attempts WHERE owner=? AND id=?").get(owner,id) as Attempt|undefined;
  if(!a)throw new AccountError("missing",404);
  const checkpoint=database().prepare("SELECT * FROM creations WHERE owner=? AND collection='temporary' AND id=? AND deleted_at IS NULL").get(owner,id) as CreationRow|undefined;
  return {status:a.status,checkpoint:checkpoint?record(checkpoint):null};
}
export function cancelAttempt(owner:string,id:string,token:string){
  const r=runtime(),db=database();const outcome=db.transaction(()=>{
    const a=db.prepare("SELECT * FROM attempts WHERE owner=? AND id=?").get(owner,id) as Attempt|undefined;
    if(a&&!equalSecret(a.token_hash,hash(token)))throw new AccountError("permissions",403);
    if(a&&a.status!=="running")return a.outcome?JSON.parse(a.outcome) as GenerationOutcome:{status:409,code:a.status==="canceled"?"canceled":"deleted"};
    const run=a?.payload?{...JSON.parse(a.payload),status:"canceled",errorCode:"canceled"} as GenerationRun:undefined;
    const outcome:GenerationOutcome={status:409,code:"canceled",error:"Generation canceled. Provider processing may continue; this request will not retry.",run};
    if(!a){takeLimit(`cancel:${owner}`,30);db.prepare("INSERT INTO attempts(owner,id,token_hash,status,created_at,outcome,updated_at) VALUES(?,?,?,'canceled',?,?,?)").run(owner,id,hash(token),Date.now(),JSON.stringify(outcome),Date.now());}
    else {db.prepare("UPDATE attempts SET status='canceled',payload=?,outcome=?,provenance=?,updated_at=? WHERE owner=? AND id=?").run(JSON.stringify(run),JSON.stringify(outcome),run?runProvenance(run):null,Date.now(),owner,id);
      const rows=db.prepare("SELECT * FROM creations WHERE owner=? AND collection='temporary' AND json_extract(payload,'$.run.id')=? AND (deleted_at IS NULL OR undo_until>=?)").all(owner,id,Date.now()) as CreationRow[];
      for(const row of rows){const state={...JSON.parse(row.payload!),run};db.prepare("UPDATE creations SET identity=?,revision=revision+1,payload=?,updated_at=? WHERE owner=? AND collection='temporary' AND id=?").run(creationIdentity("temporary",state),JSON.stringify(state),Date.now(),owner,row.id);}}
    return outcome;
  })();const job=r.jobs.get(`${owner}:${id}`);job?.controller.abort();job?.cancel?.(outcome);return outcome;
}
export async function generateForAccount(owner:string,id:string,token:string,board:Composition,settings:GenerationSettings){
  const r=runtime(),db=database(),key=`${owner}:${id}`,fingerprint=hash(JSON.stringify({board,settings}));
  const old=db.prepare("SELECT * FROM attempts WHERE owner=? AND id=?").get(owner,id) as Attempt|undefined;
  if(old){if(!equalSecret(old.token_hash,hash(token)))throw new AccountError("permissions",403);if(old.fingerprint&&old.fingerprint!==fingerprint)throw new AccountError("conflict",409);
    const job=r.jobs.get(key);if(job)return job.pending?{...job.pending,status:503,code:"persistence",persistencePending:true}:await job.promise;
    if(old.outcome)return JSON.parse(old.outcome) as GenerationOutcome;
    return {status:409,code:old.status==="canceled"?"canceled":"deleted"};
  }
  if(!generationConfig().configured)throw new AccountError("setup",503);if(!generationConfig().models.includes(settings.model))throw new AccountError("validation");
  const now=Date.now();r.recent=r.recent.filter(t=>now-t<60000);
  if(r.active>=2||r.recent.length>=6||r.jobs.size>=100)throw new AccountError("limit",429);
  const run:GenerationRun={id,createdAt:now,board:structuredClone(board),settings:{...settings},brief:compileBrief(board,settings.locale),identity:semanticIdentity(board,settings.locale),status:"running"};
  db.transaction(()=>{takeLimit(`generate:${owner}`,4);db.prepare("INSERT INTO attempts(owner,id,fingerprint,token_hash,status,created_at,payload,outcome,updated_at) VALUES(?,?,?,?,?,?,?,NULL,?)").run(owner,id,fingerprint,hash(token),"running",now,JSON.stringify(run),now);
    const state={schemaVersion:1 as const,id,createdAt:now,board:run.board,settings:run.settings,run};db.prepare("INSERT INTO creations(owner,collection,id,identity,revision,created_at,payload,updated_at) VALUES(?,'temporary',?,?,1,?,?,?)").run(owner,id,creationIdentity("temporary",state),now,JSON.stringify(state),now);
  })();
  r.active++;r.recent.push(now);const controller=new AbortController();
  const job:Job={controller,promise:Promise.resolve({status:202})};r.jobs.set(key,job);
  const canceled=new Promise<GenerationOutcome>(resolve=>{job.cancel=resolve;});
  const processing=(async()=>{
    let outcome:GenerationOutcome;
    try{const result=await openRouterGenerator.generate(run.board,run.settings,controller.signal);outcome={status:200,result,run:{...run,status:"succeeded",result}};}
    catch(error){const code=error instanceof GenerationError?error.code:"unknown",status=error instanceof GenerationError?error.status:502;outcome={status,code,error:error instanceof GenerationError?error.message:"Generation ended unexpectedly. Check your provider activity before trying again.",run:{...run,status:code==="canceled"?"canceled":code==="unknown"||code==="unreadable"?"unknown":"failed",errorCode:code}};}
    finally{r.active--;}
    try{const saved=persist(owner,id,outcome);r.jobs.delete(key);return saved;}
    catch{job.pending=outcome;return {...outcome,status:503,code:"persistence",persistencePending:true};}
  })();job.promise=Promise.race([processing,canceled]);return await job.promise;
}
export function retryGenerationPersistence(owner:string,id:string,token:string){
  const r=runtime(),key=`${owner}:${id}`,a=database().prepare("SELECT token_hash FROM attempts WHERE owner=? AND id=?").get(owner,id) as {token_hash:string}|undefined;
  if(!a||!equalSecret(a.token_hash,hash(token)))throw new AccountError("permissions",403);
  const pending=r.jobs.get(key)?.pending;if(!pending)throw new AccountError("missing",404);
  const outcome=persist(owner,id,pending);r.jobs.delete(key);return outcome;
}

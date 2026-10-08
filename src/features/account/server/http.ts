import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { boundedText, BodyTooLargeError } from "@/lib/bounded-text";
import { authReady } from "./auth";
import { accountConfig } from "./config";
import { database } from "./database";
export class AccountError extends Error {constructor(public code:string,public status=400){super(code);}}
export const privateHeaders={"Cache-Control":"private, no-store","Vary":"Cookie"};
export function json(data:unknown,status=200){return NextResponse.json(data,{status,headers:privateHeaders});}
export async function endpoint(operation:()=>Promise<Response>|Response){try{const response=await operation();response.headers.set("Cache-Control",privateHeaders["Cache-Control"]);response.headers.set("Vary",[response.headers.get("Vary"),"Cookie"].filter(Boolean).join(", "));return response;}catch(error){if(error instanceof AccountError)return json({code:error.code},error.status);if(error instanceof BodyTooLargeError)return json({code:"size"},413);return json({code:"storage"},503);}}
export function sameOrigin(request:Request){
  if(request.headers.get("sec-fetch-site")==="cross-site"||request.headers.get("origin")!==accountConfig().url)throw new AccountError("origin",403);
}
export async function input(request:Request,limit=512000):Promise<Record<string,unknown>>{try{const value=JSON.parse(await boundedText(request,limit));if(!value||typeof value!=="object"||Array.isArray(value))throw new Error();return value;}catch(error){if(error instanceof BodyTooLargeError)throw error;throw new AccountError("validation");}}
export async function requireAccount(headers:Headers,activated=true){
  const auth=await authReady();const session=await auth.api.getSession({headers,query:{disableCookieCache:true}});
  if(!session||headers.get("x-account-id")&&headers.get("x-account-id")!==session.user.id)throw new AccountError("session",401);
  const user=database().prepare('SELECT activatedAt FROM user WHERE id=?').get(session.user.id) as {activatedAt:number}|undefined;
  if(activated&&!user?.activatedAt)throw new AccountError("activation",403);
  return {id:session.user.id,name:session.user.name,username:session.user.username||"",activated:!!user?.activatedAt};
}
export function hash(value:string){return createHash("sha256").update(value).digest("hex");}
export function equalSecret(a:string,b:string){return timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));}
export function takeLimit(key:string,max:number,window=60000){
  const db=database(),now=Date.now();db.transaction(()=>{
    db.prepare("DELETE FROM app_limits WHERE reset_at<?").run(now);
    const old=db.prepare("SELECT count,reset_at FROM app_limits WHERE key=?").get(key) as {count:number;reset_at:number}|undefined;
    if(old&&old.count>=max)throw new AccountError("limit",429);
    db.prepare("INSERT INTO app_limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,reset_at=excluded.reset_at").run(key,(old?.count||0)+1,old?.reset_at||now+window);
  })();
}
export function requestIp(request:Request){return hash(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local");}

import { randomUUID } from "node:crypto";
import { authReady } from "@/features/account/server/auth";
import { AccountError, endpoint, input, json, requestIp, sameOrigin, takeLimit } from "@/features/account/server/http";
export const runtime="nodejs";
export async function POST(request:Request){return endpoint(async()=>{
  sameOrigin(request);await authReady();takeLimit(`register:${requestIp(request)}`,10);takeLimit("register:global",30);
  const body=await input(request,4096),username=body.username,name=body.name,password=body.password;
  if(typeof username!=="string"||! /^[a-zA-Z0-9_.]{3,30}$/.test(username)||typeof name!=="string"||!name.trim()||name.trim().length>80||typeof password!=="string"||password.length<12||password.length>128)throw new AccountError("validation");
  const auth=await authReady();
  const response=await auth.api.signUpEmail({headers:request.headers,body:{username:username.toLowerCase(),name:name.trim(),password,email:`${randomUUID()}@accounts.invalid`},asResponse:true});
  if(!response.ok){const error=await response.json();return json({code:error.code||"registration"},response.status);}
  const headers=new Headers({"Cache-Control":"private, no-store","Content-Type":"application/json"});
  for(const cookie of response.headers.getSetCookie())headers.append("Set-Cookie",cookie);
  return new Response(JSON.stringify({ok:true}),{headers});
});}

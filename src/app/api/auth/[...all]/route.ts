import { authReady } from "@/features/account/server/auth";
import { endpoint, json, requireAccount, sameOrigin } from "@/features/account/server/http";
export const runtime="nodejs";
async function handle(request:Request){return endpoint(async()=>{
  const path=new URL(request.url).pathname.replace(/^\/api\/auth/,"");
  if(!((request.method==="GET"&&path==="/get-session")||(request.method==="POST"&&["/sign-in/username","/sign-out"].includes(path))))return json({code:"unavailable"},404);
  if(request.method!=="GET")sameOrigin(request);if(path==="/sign-out"&&request.headers.has("x-account-id"))await requireAccount(request.headers,false);
  const auth=await authReady(),response=await auth.handler(request);response.headers.set("Cache-Control","private, no-store");return response;
});}
export const GET=handle,POST=handle;

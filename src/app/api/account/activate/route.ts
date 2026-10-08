import { accountConfig } from "@/features/account/server/config";
import { database } from "@/features/account/server/database";
import { AccountError, endpoint, equalSecret, input, json, requestIp, requireAccount, sameOrigin, takeLimit } from "@/features/account/server/http";
export const runtime="nodejs";
const normalize=(value:string)=>value.normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
export async function POST(request:Request){return endpoint(async()=>{
  sameOrigin(request);const account=await requireAccount(request.headers,false);if(account.activated)return json({ok:true});
  takeLimit(`activate:user:${account.id}`,6);takeLimit(`activate:ip:${requestIp(request)}`,20);
  const body=await input(request,4096),config=accountConfig();
  if(typeof body.phrase!=="string"||body.phrase.length>500||typeof body.emojiId!=="string"||!equalSecret(normalize(body.phrase),normalize(config.phrase))||!equalSecret(body.emojiId,config.emoji))throw new AccountError("invitation",403);
  database().prepare("UPDATE user SET activatedAt=? WHERE id=? AND (activatedAt IS NULL OR activatedAt=0)").run(Date.now(),account.id);return json({ok:true});
});}

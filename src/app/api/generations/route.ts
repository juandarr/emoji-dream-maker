import { NextRequest, NextResponse } from "next/server";
import { boundedText, BodyTooLargeError } from "@/lib/bounded-text";
import { parseComposition } from "@/features/playground/model";
import { outputKinds, reasoningEfforts, type GenerationSettings } from "@/features/generation/model";
import { generationConfig, GenerationError, openRouterGenerator } from "@/features/generation/server/openrouter";

export const runtime="nodejs";
export const maxDuration=130;
const headers={"Cache-Control":"no-store"};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
type Outcome={result?:Awaited<ReturnType<typeof openRouterGenerator.generate>>;error?:string;code?:string;status:number};
// Local single-process MVP. Retains failures/unknown outcomes so a transport retry never resubmits.
const submissions=new Map<string,{fingerprint:string;at:number;promise:Promise<Outcome>}>();
let active=0;
let recent:number[]=[];
function isAppRequest(request:NextRequest) {
  if(request.headers.get("sec-fetch-site")==="cross-site")return false;
  const origin=request.headers.get("origin");
  if(!origin)return true;
  try {
    const url=new URL(request.url);
    // Next may normalize request.url to localhost even when the browser uses
    // 127.0.0.1. Host identifies the address actually requested by the browser.
    const target=new URL(`${url.protocol}//${request.headers.get("host")||url.host}`);
    return origin===target.origin;
  } catch {return false;}
}
export async function GET() {return json(generationConfig());}
export async function POST(request:NextRequest) {
  if(!isAppRequest(request))return json({error:"The request's app address could not be verified. Reload the Playground page and try again.",code:"origin"},403);
  let input;
  try {input=JSON.parse(await boundedText(request,512000));}
  catch(error){return json({error:"Invalid or oversized generation request.",code:"validation"},error instanceof BodyTooLargeError?413:400);}
  let board,settings:GenerationSettings;
  try {
    if(!input||typeof input!=="object"||typeof input.requestId!=="string"||!/^[-\w]{16,100}$/.test(input.requestId))throw new Error();
    board=parseComposition(input.board);
    if(!board.nodes.length)throw new Error();
    const s=input.settings;
    if(!s||!outputKinds.includes(s.kind)||!["en","es"].includes(s.locale)||typeof s.tone!=="string"||s.tone.length>120||!generationConfig().models.includes(s.model)||(s.reasoningEffort!==undefined&&!reasoningEfforts.includes(s.reasoningEffort)))throw new Error();
    settings={kind:s.kind,locale:s.locale,tone:s.tone,model:s.model,reasoningEffort:s.reasoningEffort||generationConfig().reasoningEffort};
  } catch {return json({error:"Choose a valid board, output, language and configured model.",code:"validation"},400);}
  if(!generationConfig().configured)return json({error:"OpenRouter is not connected. Set OPENROUTER_API_KEY in .env.local and restart the server.",code:"setup"},503);
  const fingerprint=JSON.stringify({board,settings});
  const now=Date.now();
  for(const [key,entry] of submissions)if(now-entry.at>30*60*1000)submissions.delete(key);
  const existing=submissions.get(input.requestId);
  if(existing){if(existing.fingerprint!==fingerprint)return json({error:"This request ID was already used for different input.",code:"conflict"},409);const outcome=await existing.promise;return json(outcome,outcome.status);}
  recent=recent.filter(t=>now-t<60000);
  if(active>=2||recent.length>=6||submissions.size>=100)return json({error:"Generation limit reached. Wait a minute before trying again.",code:"limit"},429);
  active++;recent.push(now);
  const promise=(async():Promise<Outcome>=>{
    try {return {result:await openRouterGenerator.generate(board,settings),status:200};}
    catch(error){return error instanceof GenerationError?{error:error.message,code:error.code,status:error.status}:{error:"Generation ended unexpectedly. Check your OpenRouter activity before trying again.",code:"unknown",status:502};}
    finally {active--;}
  })();
  submissions.set(input.requestId,{fingerprint,at:now,promise});
  const outcome=await promise;
  return json(outcome,outcome.status);
}

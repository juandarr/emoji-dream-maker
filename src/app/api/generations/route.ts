import { parseComposition } from "@/features/playground/model";
import { outputKinds, reasoningEfforts, type GenerationSettings } from "@/features/generation/model";
import { generationConfig } from "@/features/generation/server/openrouter";
import { AccountError, endpoint, input, json, requireAccount, sameOrigin } from "@/features/account/server/http";
import { attemptStatus, cancelAttempt, generateForAccount, retryGenerationPersistence } from "@/features/account/server/generation";
export const runtime="nodejs";
export const maxDuration=130;
function identifiers(body:Record<string,unknown>){if(typeof body.requestId!=="string"||!/^[-\w]{16,100}$/.test(body.requestId)||typeof body.cancelToken!=="string"||!/^[-\w]{32,100}$/.test(body.cancelToken))throw new AccountError("validation");return {id:body.requestId,token:body.cancelToken};}
export async function GET(request:Request){return endpoint(async()=>{const user=await requireAccount(request.headers),id=new URL(request.url).searchParams.get("requestId");return json(id?attemptStatus(user.id,id):generationConfig());});}
export async function DELETE(request:Request){return endpoint(async()=>{sameOrigin(request);const user=await requireAccount(request.headers),body=identifiers(await input(request,1000));const outcome=cancelAttempt(user.id,body.id,body.token);return json(outcome);});}
export async function PATCH(request:Request){return endpoint(async()=>{sameOrigin(request);const user=await requireAccount(request.headers),body=identifiers(await input(request,1000));const outcome=retryGenerationPersistence(user.id,body.id,body.token);return json(outcome);});}
export async function POST(request:Request){return endpoint(async()=>{
  sameOrigin(request);const user=await requireAccount(request.headers),body=await input(request),ids=identifiers(body);
  let board,settings:GenerationSettings;
  try{board=parseComposition(body.board);const s=body.settings as GenerationSettings;
    if(!board.nodes.length||!s||!outputKinds.includes(s.kind)||!["en","es"].includes(s.locale)||typeof s.tone!=="string"||s.tone.length>120||typeof s.model!=="string"||s.model.length>150||s.reasoningEffort!==undefined&&!reasoningEfforts.includes(s.reasoningEffort))throw new Error();
    settings={kind:s.kind,locale:s.locale,tone:s.tone,model:s.model,reasoningEffort:s.reasoningEffort||generationConfig().reasoningEffort};
  }catch{throw new AccountError("validation");}
  // Terminal retries are resolved by the durable attempt ledger even if connection settings changed.
  const outcome=await generateForAccount(user.id,ids.id,ids.token,board,settings);return json(outcome,outcome.status);
});}

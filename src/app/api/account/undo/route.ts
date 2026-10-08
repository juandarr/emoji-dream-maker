import { endpoint, input, json, requireAccount, sameOrigin } from "@/features/account/server/http";
import { undoRemoval } from "@/features/account/server/creations";
export const runtime="nodejs";
export async function POST(request:Request){return endpoint(async()=>{sameOrigin(request);const user=await requireAccount(request.headers),body=await input(request,1000);return json(undoRemoval(user.id,body.token));});}

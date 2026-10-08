import { endpoint, input, json, requireAccount, sameOrigin } from "@/features/account/server/http";
import { readAccountData, writeAccountData } from "@/features/account/server/state";
export const runtime="nodejs";
export async function GET(request:Request){return endpoint(async()=>{const account=await requireAccount(request.headers);return json(readAccountData(account.id));});}
export async function PUT(request:Request){return endpoint(async()=>{sameOrigin(request);const account=await requireAccount(request.headers),body=await input(request,2000000);return json(writeAccountData(account.id,body,body.revision));});}

import { endpoint, input, json, requireAccount, sameOrigin } from "@/features/account/server/http";
import { collection, listCreations, putCreation, removeCreations } from "@/features/account/server/creations";
export const runtime="nodejs";
export async function GET(request:Request){return endpoint(async()=>{const user=await requireAccount(request.headers);return json(listCreations(user.id,collection(new URL(request.url).searchParams.get("collection"))));});}
export async function PUT(request:Request){return endpoint(async()=>{sameOrigin(request);const user=await requireAccount(request.headers),body=await input(request,1600000);return json(putCreation(user.id,collection(body.collection),body.state,body.revision));});}
export async function DELETE(request:Request){return endpoint(async()=>{sameOrigin(request);const user=await requireAccount(request.headers),body=await input(request,1600000);return json(removeCreations(user.id,collection(body.collection),body.records));});}

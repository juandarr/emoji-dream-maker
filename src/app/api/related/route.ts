import { requireAccount, endpoint, sameOrigin } from "@/features/account/server/http";
import { NextRequest, NextResponse } from "next/server";
import { relatedTopics } from "@/lib/wikipedia";
import type { Locale } from "@/lib/types";
async function handle(request:NextRequest) {
  const title=request.nextUrl.searchParams.get("title")?.trim();
  const locale=request.nextUrl.searchParams.get("locale")||"en";
  if(!title || title.length>200 || title.includes("|") || !["en","es"].includes(locale))return NextResponse.json({error:"Invalid article or language."},{status:400});
  const result=await relatedTopics(title,locale as Locale,AbortSignal.any([request.signal,AbortSignal.timeout(6000)]));
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
}

export async function GET(request:NextRequest){return endpoint(async()=>{await requireAccount(request.headers);return handle(request);});}

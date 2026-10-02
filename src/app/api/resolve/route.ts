import { NextRequest, NextResponse } from "next/server";
import { emojiById } from "@/lib/catalog";
import { resolveTopic } from "@/lib/providers";
import type { Locale } from "@/lib/types";
export async function GET(request: NextRequest) {
  const id=request.nextUrl.searchParams.get("emojiId")||"";
  const locale=request.nextUrl.searchParams.get("locale")||"en";
  const query=request.nextUrl.searchParams.get("q")?.trim()||undefined;
  if(!emojiById.has(id)||!["en","es"].includes(locale)||query&&query.length>150) return NextResponse.json({error:"Invalid emoji, language, or subject."},{status:400});
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(4800)]);
  const result=await resolveTopic(id,locale as Locale,signal,query);
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
}

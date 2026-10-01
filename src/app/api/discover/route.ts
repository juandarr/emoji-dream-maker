import { NextRequest, NextResponse } from "next/server";
import { emojiById } from "@/lib/catalog";
import { validTopic } from "@/lib/storage";
import { discover } from "@/lib/providers";
import type { DiscoverInput } from "@/lib/types";
export async function POST(request: NextRequest) {
  if(Number(request.headers.get("content-length")||0)>8192) return NextResponse.json({error:"Request too large."},{status:413});
  let body: DiscoverInput;
  try { const raw=await request.text(); if(raw.length>8192) return NextResponse.json({error:"Request too large."},{status:413}); body=JSON.parse(raw); } catch { return NextResponse.json({error:"Invalid request."},{status:400}); }
  if(!body||!emojiById.has(body.emojiId)||!["en","es"].includes(body.locale)||!["wikipedia","youtube","freesound","art"].includes(body.provider)||!validTopic(body.topic)) return NextResponse.json({error:"Invalid emoji, subject, language, or provider."},{status:400});
  const result=await discover(body,AbortSignal.any([request.signal,AbortSignal.timeout(body.provider==="youtube"?17_000:7800)]));
  return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});
}

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/resolve/route";
import { POST } from "@/app/api/discover/route";
describe("provider boundaries",()=>{
  it("rejects unknown emoji IDs and languages",async()=>{expect((await GET(new NextRequest("http://localhost/api/resolve?emojiId=invalid&locale=en"))).status).toBe(400);expect((await GET(new NextRequest("http://localhost/api/resolve?emojiId=1F419&locale=xx"))).status).toBe(400);});
  it("rejects malformed JSON, arbitrary providers and oversized requests",async()=>{for(const body of ["{broken",JSON.stringify({emojiId:"1F419",locale:"en",provider:"https://example.com",topic:{}}),"x".repeat(8200)]){const response=await POST(new NextRequest("http://localhost/api/discover",{method:"POST",body}));expect([400,413]).toContain(response.status);}});
});

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/resolve/route";
import { POST } from "@/app/api/discover/route";
vi.mock("@/features/account/server/http",async importOriginal=>({...await importOriginal<typeof import("@/features/account/server/http")>(),requireAccount:async()=>({id:"test-owner"}),sameOrigin:()=>{}}));
describe("provider boundaries",()=>{
  it("rejects unknown emoji IDs and languages",async()=>{expect((await GET(new NextRequest("http://localhost/api/resolve?emojiId=invalid&locale=en"))).status).toBe(400);expect((await GET(new NextRequest("http://localhost/api/resolve?emojiId=1F419&locale=xx"))).status).toBe(400);});
  it("rejects malformed JSON, arbitrary providers and oversized requests",async()=>{for(const body of ["{broken",JSON.stringify({emojiId:"1F419",locale:"en",provider:"https://example.com",topic:{}}),"x".repeat(8200)]){const response=await POST(new NextRequest("http://localhost/api/discover",{method:"POST",body}));expect([400,413]).toContain(response.status);}});
});

it("bounds POST bodies in bytes even when content-length is absent", async () => {
  const body=JSON.stringify({emojiId:"1F419",locale:"en",provider:"art",topic:{label:"x",query:"x",englishQuery:"x",language:"en"},padding:"🐙".repeat(2100)});
  expect(body.length).toBeLessThan(8192);
  expect((await POST(new NextRequest("http://localhost/api/discover",{method:"POST",body}))).status).toBe(413);
});

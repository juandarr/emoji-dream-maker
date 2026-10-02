import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { emojiById } from "@/lib/catalog";
import { createNode, emptyComposition } from "@/features/playground/model";
import { GET, POST } from "@/app/api/generations/route";
import { GenerationError, openRouterGenerator } from "@/features/generation/server/openrouter";
const settings={kind:"poem" as const,locale:"en" as const,tone:"gentle",model:"test/text"};
const board={...emptyComposition(),nodes:[createNode(emojiById.get("2764")!,"en","heart",0)]};
function request(body:unknown,headers?:Record<string,string>){return new NextRequest("http://localhost/api/generations",{method:"POST",body:typeof body==="string"?body:JSON.stringify(body),headers});}
beforeEach(()=>{vi.stubEnv("OPENROUTER_API_KEY","test-secret");vi.stubEnv("OPENROUTER_MODELS","test/text");vi.stubEnv("OPENROUTER_REASONING_EFFORT","default");vi.stubEnv("OPENROUTER_MAX_COMPLETION_TOKENS","8192");});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("generation endpoint",()=>{
  it("checks the browser-facing Host when Next normalizes the internal URL",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    const headers={host:"127.0.0.1:3001",origin:"http://127.0.0.1:3001","sec-fetch-site":"same-origin"};
    // An empty body reaches validation without submitting a provider request.
    expect((await POST(request({},headers))).status).toBe(400);
    expect((await POST(request({},{host:"localhost:80",origin:"http://localhost"}))).status).toBe(400);
    for(const overrides of [{origin:"http://localhost"},{origin:"https://other.example"},{origin:"null"},{"sec-fetch-site":"cross-site"}]) {
      expect((await POST(request({},{...headers,...overrides}))).status).toBe(403);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("exposes capabilities without exposing credentials",async()=>{const data=await (await GET()).json();expect(data.configured).toBe(true);expect(data.models).toEqual(["test/text"]);expect(JSON.stringify(data)).not.toContain("test-secret");});
  it("rejects cross-site, invalid, oversized and unconfigured requests before sending",async()=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    expect((await POST(request({board,settings,requestId:crypto.randomUUID()},{origin:"https://other.example"}))).status).toBe(403);
    for(const body of ["{broken",{board,settings:{...settings,model:"unapproved"},requestId:crypto.randomUUID()},{board,settings:{...settings,reasoningEffort:"unsupported"},requestId:crypto.randomUUID()},{board:emptyComposition(),settings,requestId:crypto.randomUUID()}])expect((await POST(request(body))).status).toBe(400);
    expect((await POST(request("x".repeat(512001)))).status).toBe(413);
    vi.stubEnv("OPENROUTER_API_KEY","");expect((await POST(request({board,settings,requestId:crypto.randomUUID()}))).status).toBe(503);expect(fetch).not.toHaveBeenCalled();
  });
  it("deduplicates simultaneous submissions and rejects ID reuse with different input",async()=>{
    const generate=vi.spyOn(openRouterGenerator,"generate").mockResolvedValue({text:"A little poem",model:"test/text",provider:"openrouter"});
    const requestId=crypto.randomUUID(),input={board,settings,requestId};
    const results=await Promise.all([POST(request(input)),POST(request(input))]);
    expect(results.map(r=>r.status)).toEqual([200,200]);expect(generate).toHaveBeenCalledTimes(1);
    expect((await POST(request({...input,settings:{...settings,tone:"bold"}}))).status).toBe(409);
  });
  it("admits at most two simultaneous provider requests",async()=>{
    let release:()=>void=()=>{};
    const ready=new Promise<void>(resolve=>{release=resolve;});
    const generate=vi.spyOn(openRouterGenerator,"generate").mockImplementation(async()=>{await ready;return {text:"Poem",model:"test/text",provider:"openrouter"};});
    const first=POST(request({board,settings,requestId:crypto.randomUUID()}));
    const second=POST(request({board,settings,requestId:crypto.randomUUID()}));
    await vi.waitFor(()=>expect(generate).toHaveBeenCalledTimes(2));
    expect((await POST(request({board,settings,requestId:crypto.randomUUID()}))).status).toBe(429);
    release();expect((await first).status).toBe(200);expect((await second).status).toBe(200);
  });
  it("retains an unknown outcome without charging again on a transport retry",async()=>{
    const generate=vi.spyOn(openRouterGenerator,"generate").mockRejectedValue(new GenerationError("unknown",504,"Unknown outcome"));
    const input={board,settings,requestId:crypto.randomUUID()};
    expect((await POST(request(input))).status).toBe(504);const retry=await POST(request(input));expect((await retry.json()).code).toBe("unknown");expect(generate).toHaveBeenCalledTimes(1);
  });
});
describe("OpenRouter adapter",()=>{
  it("sends chosen meanings as a bounded text request and records usage",async()=>{
    const fetch=vi.fn().mockResolvedValue(Response.json({id:"gen-1",model:"test/actual",choices:[{message:{content:"Test poem"}}],usage:{prompt_tokens:100,completion_tokens:20,cost:0.001}}));vi.stubGlobal("fetch",fetch);
    const custom=structuredClone(board);custom.nodes[0].meaning="Human heart";
    const result=await openRouterGenerator.generate(custom,settings);
    const [url,init]=fetch.mock.calls[0];expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");expect(init.headers.Authorization).toBe("Bearer test-secret");
    const body=JSON.parse(init.body);expect(body.max_completion_tokens).toBe(8192);expect(body.messages[1].content).toContain("Human heart");expect(body.tools).toBeUndefined();expect(result.model).toBe("test/actual");expect(result.usage?.cost).toBe(0.001);
  });
  it("does not expose provider error payloads or secrets",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({error:{message:"test-secret internal info"}},{status:401})));
    await expect(openRouterGenerator.generate(board,settings)).rejects.toThrow("rejected the API key");
  });
});

it("sends high reasoning with a budget that includes the final answer",async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:"An answer"}}]}));vi.stubGlobal("fetch",fetch);
  await openRouterGenerator.generate(board,{...settings,reasoningEffort:"high"});
  const body=JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.reasoning).toEqual({effort:"high",exclude:true});expect(body.provider.require_parameters).toBe(true);expect(body.max_completion_tokens).toBe(8192);
});
it("explains a completion budget exhausted by reasoning without exposing the reasoning",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({choices:[{finish_reason:"length",message:{content:"",reasoning:"hidden thinking"}}]})));
  await expect(openRouterGenerator.generate(board,settings)).rejects.toThrow("completion budget");
});

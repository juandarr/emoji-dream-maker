import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { emojiById } from "@/lib/catalog";
import { createNode, emptyComposition } from "@/features/playground/model";
import { GET, POST } from "@/app/api/generations/route";
import { GenerationError, openRouterGenerator } from "@/features/generation/server/openrouter";
import { creationTitle, outputKinds, type GenerationRun } from "@/features/generation/model";
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

it("accepts Interpretation as a generation mode",async()=>{
  const generate=vi.spyOn(openRouterGenerator,"generate").mockResolvedValue({title:"A little connection",text:"Two symbols suggest a new beginning.",model:"test/text",provider:"openrouter"});
  const response=await POST(request({board,settings:{...settings,kind:"interpretation",locale:"es"},requestId:crypto.randomUUID()}));
  expect(response.status).toBe(200);expect(generate).toHaveBeenCalledWith(board,expect.objectContaining({kind:"interpretation",locale:"es"}));
});

it("requests a one-paragraph interpretation and a title in the selected output language in one call",async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:JSON.stringify({title:"Un nuevo comienzo",text:"Estos símbolos evocan\n\nuna nueva amistad."})}}]}));vi.stubGlobal("fetch",fetch);
  const result=await openRouterGenerator.generate(board,{...settings,kind:"interpretation",locale:"es"});
  expect(result.title).toBe("Un nuevo comienzo");expect(result.text).toBe("Estos símbolos evocan una nueva amistad.");
  expect(fetch).toHaveBeenCalledTimes(1);const prompt=JSON.parse(fetch.mock.calls[0][1].body).messages[0].content;
  expect(prompt).toContain("exactly one paragraph");expect(prompt).toContain("Spanish");expect(prompt).toContain('"title"');expect(prompt).toContain("otherwise invent");
});

for(const locale of ["en","es"] as const)it(`requires both generated fields in ${locale} for every output format, even with source ideas in another language`,async()=>{
  const fetch=vi.fn().mockImplementation(async()=>Response.json({choices:[{message:{content:JSON.stringify({title:locale==="es"?"Una celebración llena de alegría":"A celebration full of joy",text:locale==="es"?"La escena sugiere una celebración.":"The scene suggests a celebration."})}}]}));vi.stubGlobal("fetch",fetch);
  const source={...board,nodes:[{...board.nodes[0],customMeaning:true,meaning:locale==="es"?"Gifts and joy":"Regalos y alegría"}]};
  for(const kind of outputKinds)await openRouterGenerator.generate(source,{...settings,locale,kind});
  expect(fetch).toHaveBeenCalledTimes(outputKinds.length);
  for(const [,init] of fetch.mock.calls){
    const messages=JSON.parse(init.body).messages,language=locale==="es"?"Spanish":"English";
    expect(messages[0].content).toContain(`Both "title" and "text" must be written in ${language}`);
    expect(messages[0].content).toContain(`invent a concise, evocative title in ${language}`);
    expect(messages[0].content).toContain(locale==="es"?"No generes un título en inglés para un texto en español":"Do not generate a Spanish title for an English body");
    const input=JSON.parse(messages[1].content);expect(input.outputLanguage).toBe(language);expect(input.brief.locale).toBe(locale);expect(input.brief.entities[0].meaning).toBe(source.nodes[0].meaning);
  }
});

it("uses the translated output title without replacing the author's original scene title",async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:'```json\n{"title":"Una celebración de regalos y alegría","text":"La escena evoca una celebración."}\n```'}}]}));vi.stubGlobal("fetch",fetch);
  const source={...board,title:"A Festive Gathering of Gifts and Joy"};
  const result=await openRouterGenerator.generate(source,{...settings,kind:"interpretation",locale:"es"});
  expect(result.title).toBe("Una celebración de regalos y alegría");expect(result.text).toBe("La escena evoca una celebración.");expect(source.title).toBe("A Festive Gathering of Gifts and Joy");
  const prompt=JSON.parse(fetch.mock.calls[0][1].body).messages[0].content;expect(prompt).toContain("translate it into Spanish");
  const run={board:source,result} as GenerationRun;expect(creationTitle(run)).toBe(result.title);
  expect(creationTitle({board:source} as GenerationRun)).toBe(source.title);
});

it("gives plain-text model responses a title while keeping the authored board untouched",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:"An ordinary text-only poem."}}]})));
  const result=await openRouterGenerator.generate(board,settings);
  expect(result.title).toBe("red heart");expect(result.text).toBe("An ordinary text-only poem.");expect(board.title).toBe("");
});

it("localizes Spanish fallback titles even when the board was authored in English",async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:"La escena evoca una celebración llena de alegría."}}]}));vi.stubGlobal("fetch",fetch);
  const source={...board,nodes:[{...board.nodes[0],customMeaning:true,meaning:"Gifts and joy"}]};
  const result=await openRouterGenerator.generate(source,{...settings,kind:"interpretation",locale:"es"});
  expect(result.title).toBe("corazón rojo");expect(result.text).toBe("La escena evoca una celebración llena de alegría.");expect(source.nodes[0].meaning).toBe("Gifts and joy");expect(fetch).toHaveBeenCalledTimes(1);
});

it("uses a Spanish fallback for unknown imported symbols instead of their English labels",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:'{"title":"","text":"Una escena llena de alegría."}'}}]})));
  const source={...board,nodes:[{...board.nodes[0],emojiId:"unknown-import",label:"A festive gathering",meaning:"Gifts and joy"}]};
  const result=await openRouterGenerator.generate(source,{...settings,locale:"es"});expect(result.title).toBe("Inspiración del lienzo");
});

it("rejects incomplete structured output instead of exposing broken JSON as a creation",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:'{"title":"A lost tale","text":'}}]})));
  await expect(openRouterGenerator.generate(board,settings)).rejects.toThrow("incomplete creation");
});


it("sends spatial story cues while preserving authored context as the priority",async()=>{
  const fetch=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:'{"title":"A woodland snack","text":"The bear pauses beside a tiny mushroom."}'}}]}));vi.stubGlobal("fetch",fetch);
  const scene={...emptyComposition(),intent:"An imaginary woodland adventure",interpretation:"The bear is protecting the mushroom, not eating it.",nodes:[{...board.nodes[0],id:"bear",glyph:"🐻",meaning:"A gentle guardian",x:50,y:50,scale:2,rotation:20},{...board.nodes[0],id:"mushroom",glyph:"🍄",meaning:"A tiny friend",x:51,y:54,scale:.4,rotation:0}]};
  await openRouterGenerator.generate(scene,{...settings,kind:"story"});
  const messages=JSON.parse(fetch.mock.calls[0][1].body).messages,brief=JSON.parse(messages[1].content).brief;
  expect(brief.layout).toContainEqual({id:"mushroom",xPercent:51,yPercent:54,sizeMultiplier:.4,clockwiseRotationDegrees:0});expect(brief.layout).toContainEqual({id:"bear",xPercent:50,yPercent:50,sizeMultiplier:2,clockwiseRotationDegrees:20});
  expect(brief.interpretation).toBe(scene.interpretation);expect(brief.intent).toBe(scene.intent);
  expect(messages[0].content).toContain("proximity, size and rotation");expect(messages[0].content).toContain("take precedence over spatial guesses");expect(messages[0].content).toContain("musical notes near an instrument");expect(messages[0].content).toContain("not mandatory rules or verified actions");
});

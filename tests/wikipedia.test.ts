import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearWikiCache, relatedTitles, relatedTopics, resolveTopic, wikipedia } from "@/lib/wikipedia";
import { defaultTopic, searchCatalog } from "@/lib/catalog";
const signal=()=>new AbortController().signal;
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
const topic={label:"Smile",query:"Smile",englishQuery:"Smile",language:"en" as const};
beforeEach(clearWikiCache);afterEach(()=>vi.unstubAllGlobals());
it("maps descriptive emoji names to bilingual concepts without altering catalog labels",()=>{
  for(const [glyph,en,es] of [["😊","Smile","Sonrisa"],["🤔","Thought","Pensamiento"],["🧘","Meditation","Meditación"],["☕","Coffee","Café"],["👍","Thumb signal","Pulgar arriba"],["🐶","Dog","Perro"]]){
    const emoji=searchCatalog(glyph)[0];expect(defaultTopic(emoji,"en").query).toBe(en);expect(defaultTopic(emoji,"es").query).toBe(es);
  }
  expect(searchCatalog("😊")[0].labels.en).toBe("smiling face with smiling eyes");
});
it("uses redirect resolution and cached summaries without repeating a search",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response({query:{pages:[{pageid:1,title:"Smile",lastrevid:22,extract:"A smile is a facial expression. It can convey happiness."}]}}));vi.stubGlobal("fetch",fetch);
  const resolved=await resolveTopic(searchCatalog("😊")[0].id,"en",signal());
  const items=await wikipedia(resolved.defaultTopic,signal());
  expect(items[0].excerpt).toContain("facial expression");expect(fetch).toHaveBeenCalledTimes(1);
  expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("redirects")).toBe("1");
});
it("uses REST lead when Action API fails, retaining attribution",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(response({},502)).mockResolvedValueOnce(response({id:1,title:"Smile",html:'<section data-mw-section-id="0"><p>A smile is a facial expression that can express happiness.</p></section>',latest:{id:5},license:{title:"CC BY-SA 4.0",url:"https://creativecommons.org/licenses/by-sa/4.0/"}})));
  const items=await wikipedia(topic,signal());expect(items[0].excerpt).toContain("facial expression");expect(items[0].revisionUrl).toContain("oldid=5");
});
it("falls back to visibly identified English context when Spanish article is missing",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(response({query:{pages:[{title:"Sonrisa",missing:true}]}})).mockResolvedValueOnce(response({query:{pages:[{pageid:1,title:"Smile",extract:"A smile is a facial expression that can express happiness."}]}})));
  const items=await wikipedia({...topic,language:"es",query:"Sonrisa"},signal());expect(items[0].language).toBe("en");
});
it("does not treat a disambiguation page as a summary",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({query:{pages:[{pageid:1,title:"Smile",pageprops:{disambiguation:""},extract:"Smile may refer to a film or an album."}]}})));
  expect(await wikipedia(topic,signal())).toEqual([]);
});
it("follows article links and excludes navigation, citations, files and self links",()=>{
  const html='<section data-mw-section-id="0"><table><a href="./Wrong">No</a></table><p>A <a href="./Smile">smile</a> conveys <a href="./Happiness">happiness</a> and <a href="./Emotion">emotion</a>.<sup><a href="./Reference">ref</a></sup><a href="https://example.com">external</a><a href="./File:Face">file</a><a class="new" href="./Missing">missing</a></p></section><section><h2 id="See_also">See also</h2><ul><li><a href="./Laughter">Laughter</a></li></ul></section><nav><a href="./Bad">Bad</a></nav>';
  expect(relatedTitles(html,"Smile")).toEqual(["Happiness","Emotion","Laughter"]);
});
it("returns verified related concepts with descriptions and English queries in one batch",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response({title:"Sonrisa",html:'<section data-mw-section-id="0"><p><a href="./Felicidad">Felicidad</a><a href="./Ambiguous">Other</a></p></section>'})).mockResolvedValueOnce(response({query:{pages:[{pageid:2,title:"Felicidad",langlinks:[{lang:"en",title:"Happiness"}],terms:{description:["Estado emocional"]}},{pageid:3,title:"Ambiguous",pageprops:{disambiguation:""}}]}}));vi.stubGlobal("fetch",fetch);
  const related=await relatedTopics("Sonrisa","es",signal());expect(related.topics).toHaveLength(1);expect(related.topics[0]).toMatchObject({label:"Felicidad",englishQuery:"Happiness",description:"Estado emocional"});expect(fetch).toHaveBeenCalledTimes(2);
});
it("keeps related-topic failure separate from the main summary",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("offline")));expect(await relatedTopics("Smile","en",signal())).toEqual({status:"error",topics:[]});
});
it("respects Retry-After without hammering alternate endpoints or blocking cached summaries",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(response({query:{pages:[{pageid:1,title:"Smile",extract:"A smile is a facial expression."}]}})).mockResolvedValueOnce(new Response("Too many requests",{status:429,headers:{"Retry-After":"60"}}));vi.stubGlobal("fetch",fetch);
  await wikipedia(topic,signal());
  await expect(wikipedia({...topic,query:"Fire"},signal())).rejects.toMatchObject({reason:"quota",retryAfter:60});
  await expect(wikipedia({...topic,query:"Ocean"},signal())).rejects.toMatchObject({reason:"quota"});
  expect((await wikipedia(topic,signal()))[0].title).toBe("Smile");expect(fetch).toHaveBeenCalledTimes(2);
});
it("removes nested formula markup while retaining the visible symbol and prose",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({query:{pages:[{pageid:1,title:"Infinity",extract:'Infinity (symbol: ∞ {\\displaystyle \\frac{a}{b}}) is a mathematical concept. It is unbounded.'}]}})));
  const items=await wikipedia({...topic,query:"Infinity"},signal());expect(items[0].excerpt).toBe("Infinity (symbol: ∞ ) is a mathematical concept. It is unbounded.");
});

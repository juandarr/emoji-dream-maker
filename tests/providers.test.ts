import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearProviderCache, discover, extractLead, resolveTopic } from "@/lib/providers";
import { searchGiphy } from "@/lib/giphy";
import { defaultTopic, searchCatalog } from "@/lib/catalog";
const emoji=searchCatalog("octopus")[0];const topic=defaultTopic(emoji,"en");
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
beforeEach(()=>{clearProviderCache();vi.stubEnv("YOUTUBE_API_KEY","");vi.stubEnv("FREESOUND_API_KEY","");vi.stubEnv("NEXT_PUBLIC_GIPHY_API_KEY","");});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe("Wikipedia context",()=>{
  it("maps a corrected Spanish subject to its English language-link title",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(response({query:{pages:[{pageid:3,title:"Cerebro",langlinks:[{lang:"en",title:"Human brain"}]}]}})).mockResolvedValueOnce(response({query:{pages:[]}})));
    const result=await resolveTopic(emoji.id,"es",new AbortController().signal,"Cerebro");
    expect(result.defaultTopic.label).toBe("Cerebro");
    expect(result.defaultTopic.englishQuery).toBe("Human brain");
  });
  it("extracts prose without infoboxes, navigation, references or later sections",()=>{const html='<section data-mw-section-id="0"><table><tr><td>Table pollution</td></tr></table><nav>Navigation</nav><p>The octopus is a marine animal with eight arms.<sup>Reference</sup> It lives in oceans around the world. Its intelligence has fascinated scientists.</p></section><section data-mw-section-id="1"><p>This is a later section and must be excluded.</p></section>';const result=extractLead(html,"en");expect(result).toContain("marine animal");expect(result).not.toMatch(/pollution|Navigation|Reference|later section/);});
  it("caps unusually long introductions at 150 words",()=>{expect(extractLead(`<p>${"octopus ".repeat(180)}.</p>`,"en").split(/\s+/).length).toBeLessThanOrEqual(150);});
  it("does not select an unrelated first article",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(response({query:{pages:[{title:"Octopus",missing:true}]}})).mockResolvedValueOnce(response({query:{pages:[{pageid:2,title:"Some other topic"}]}})));const result=await resolveTopic(emoji.id,"en",new AbortController().signal);expect(result.defaultTopic.wikiTitle).toBeUndefined();expect(result.alternatives[0].suggested).toBe(true);});
  it("offers an anatomical-heart interpretation even offline",async()=>{vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error()));const result=await resolveTopic("2764","en",new AbortController().signal);expect(result.defaultTopic.label).toBe("Love");expect(result.alternatives[0].label).toBe("Human heart");});
  it("retains article, revision and license attribution",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({query:{pages:[{pageid:9,title:"Octopus",extract:"The octopus is an animal with eight arms. It lives in the ocean.",lastrevid:42}]}})));const result=await discover({emojiId:emoji.id,topic:{...topic,wikiTitle:"Octopus"},locale:"en",provider:"wikipedia"},new AbortController().signal);expect(result.items[0].revisionUrl).toContain("oldid=42");expect(result.items[0].licenseUrl).toMatch(/^https:/);});
});
describe("independent live sources",()=>{
  it("reports missing keys without contacting their providers",async()=>{const fetch=vi.fn();vi.stubGlobal("fetch",fetch);const results=await Promise.all([discover({emojiId:emoji.id,topic,locale:"en",provider:"youtube"},new AbortController().signal),discover({emojiId:emoji.id,topic,locale:"en",provider:"freesound"},new AbortController().signal),searchGiphy("octopus","en",new AbortController().signal)]);expect(results.every(r=>r.status==="unavailable"&&r.reason==="credentials")).toBe(true);expect(fetch).not.toHaveBeenCalled();});
  it("distinguishes quota, empty and aborted responses",async()=>{
    const fetch=vi.fn().mockImplementation(async()=>response({},429));vi.stubGlobal("fetch",fetch);
    const input={emojiId:emoji.id,topic,locale:"en" as const,provider:"art" as const};
    expect((await discover(input,new AbortController().signal)).reason).toBe("quota");
    fetch.mockImplementation(async(url)=>response(String(url).includes("cleveland")?{data:[]}:{objectIDs:null}));
    expect((await discover(input,new AbortController().signal)).status).toBe("empty");
    clearProviderCache();const controller=new AbortController();controller.abort();
    expect((await discover(input,controller.signal)).reason).toBe("timeout");
  });
  it("searches a larger educational pool and verifies metadata before selecting videos",async()=>{
    vi.stubEnv("YOUTUBE_API_KEY","test-key");
    const fetch=vi.fn().mockResolvedValueOnce(response({items:[{id:{videoId:"abc"}},{id:{videoId:"deleted"}},{id:{videoId:"abc"}}]})).mockResolvedValueOnce(response({items:[{id:{videoId:"abc"}}]})).mockResolvedValueOnce(response({items:[{
      id:"abc",snippet:{title:"Octopus &amp; life explained",channelId:"marine",channelTitle:"Marine",thumbnails:{medium:{url:"https://example.com/a.jpg"}}},
      statistics:{viewCount:"10000",likeCount:"200"},contentDetails:{duration:"PT8M",definition:"hd",caption:"true"},status:{embeddable:true,privacyStatus:"public"}
    }]}));
    vi.stubGlobal("fetch",fetch);
    const result=await discover({emojiId:emoji.id,topic,locale:"en",provider:"youtube"},new AbortController().signal);
    const url=new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get("videoEmbeddable")).toBe("true");expect(url.searchParams.get("videoSyndicated")).toBe("true");
    expect(url.searchParams.get("safeSearch")).toBe("strict");expect(url.searchParams.get("maxResults")).toBe("25");
    expect(url.searchParams.get("q")).toContain("Octopus explained");
    const details=new URL(String(fetch.mock.calls[2][0]));
    expect(details.pathname).toBe("/youtube/v3/videos");expect(details.searchParams.get("id")).toBe("abc,deleted");
    expect(result.items).toHaveLength(1);expect(result.items[0].title).toBe("Octopus & life explained");
    expect(result.items[0].durationSeconds).toBe(480);expect(result.items[0].embedUrl).not.toContain("autoplay");
    await discover({emojiId:emoji.id,topic,locale:"en",provider:"youtube"},new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("does not fetch video metadata for an empty search",async()=>{
    vi.stubEnv("YOUTUBE_API_KEY","test-key");const fetch=vi.fn().mockImplementation(async()=>response({items:[]}));vi.stubGlobal("fetch",fetch);
    expect((await discover({emojiId:emoji.id,topic,locale:"en",provider:"youtube"},new AbortController().signal)).status).toBe("empty");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not show unverified search results if metadata lookup fails",async()=>{
    vi.stubEnv("YOUTUBE_API_KEY","test-key");vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(response({items:[{id:{videoId:"abc"}}]})).mockResolvedValueOnce(response({items:[]})).mockResolvedValueOnce(response({},403)));
    const result=await discover({emojiId:emoji.id,topic,locale:"en",provider:"youtube"},new AbortController().signal);
    expect(result.reason).toBe("quota");expect(result.items).toEqual([]);
  });
  it("excludes noncommercial and unattributed audio",async()=>{vi.stubEnv("FREESOUND_API_KEY","test-key");vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({results:[{id:1,name:"CC0",url:"https://freesound.org/s/1/",username:"artist",license:"https://creativecommons.org/publicdomain/zero/1.0/",previews:{"preview-hq-mp3":"https://example.com/a.mp3"}},{id:2,name:"NC",license:"https://creativecommons.org/licenses/by-nc/4.0/",previews:{"preview-hq-mp3":"https://example.com/b.mp3"}}]})));const result=await discover({emojiId:emoji.id,topic,locale:"en",provider:"freesound"},new AbortController().signal);expect(result.items.map(s=>s.title)).toEqual(["CC0"]);expect(result.items[0].creator).toBe("artist");});
  it("preserves GIPHY ordering, ratings and fresh retrieval",async()=>{vi.stubEnv("NEXT_PUBLIC_GIPHY_API_KEY","test-browser-key");const data={data:["second","first"].map(id=>({id,title:id,url:`https://giphy.com/gifs/${id}`,images:{fixed_width:{url:`https://media.giphy.com/${id}.gif`}}}))};const fetch=vi.fn().mockResolvedValue(response(data));vi.stubGlobal("fetch",fetch);const first=await searchGiphy("octopus","es",new AbortController().signal);await searchGiphy("octopus","es",new AbortController().signal);expect(first.items.map(g=>g.id)).toEqual(["second","first"]);expect(fetch).toHaveBeenCalledTimes(2);expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("rating")).toBe("g");});
});

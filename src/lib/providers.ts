import "server-only";
import { load } from "cheerio";
import { clearWikiCache, wikipedia, WikipediaError } from "./wikipedia";
export { resolveTopic, extractLead } from "./wikipedia";
import { discoverArt } from "./art";
import { discoverSounds } from "./freesound";
import { learningVideoQuery, selectLearningCandidates, youtubeApiCandidate } from "./youtube-selection";
import type { YouTubeVideo } from "./youtube-selection";
import { clearYouTubeCache, discoverYouTube } from "./youtube";
import { YouTubeError } from "./youtube-error";
import { MetadataCache } from "./metadata-cache";
import { boundedText } from "./bounded-text";
import type { DiscoverInput, Locale, ProviderResult, TopicCandidate } from "./types";

export class ProviderError extends Error {
  constructor(public reason: "quota" | "timeout" | "network", message: string) { super(message); }
}
const cache = new MetadataCache<unknown>();
export function clearProviderCache() { cache.clear(); clearWikiCache(); clearYouTubeCache(); }
async function getJSON<T>(url: URL | string, signal: AbortSignal, headers: Record<string,string> = {}): Promise<T> {
  return cache.get(JSON.stringify([String(url),headers]), signal, async sharedSignal => {
  const response = await fetch(url, { headers, signal: sharedSignal, cache: "no-store" });
  if (response.status === 429 || response.status === 403) throw new ProviderError("quota","This source is temporarily unavailable or has reached its request limit.");
  if (!response.ok) throw new ProviderError("network","This source could not be reached. Try again shortly.");
  const text = await boundedText(response, 6_000_000);
  const value = JSON.parse(text) as T;
  return value;
  }) as Promise<T>;
}
async function youtubeApi(topic: TopicCandidate, locale: Locale, signal: AbortSignal) {
  // Independent, short queries avoid ambiguous multi-word OR searches. The two
  // pools cover explanations and illustrative documentaries with at most 50 IDs.
  const pools=await Promise.allSettled([false,true].map(async documentary=>{
    const url=new URL("https://www.googleapis.com/youtube/v3/search");
    for (const [k,v] of Object.entries({part:"snippet",type:"video",order:"relevance",videoEmbeddable:"true",videoSyndicated:"true",safeSearch:"strict",maxResults:"25",q:learningVideoQuery(topic,locale,documentary),relevanceLanguage:locale,key:process.env.YOUTUBE_API_KEY!})) url.searchParams.set(k,v);
    return await getJSON<{items?:{id:{videoId?:string}}[]}>(url,signal);
  }));
  const successful=pools.filter(pool=>pool.status==="fulfilled");
  const failure=pools.find(pool=>pool.status==="rejected");
  const ids=[...new Set(successful.flatMap(pool=>(pool.value.items||[]).map(v=>v.id?.videoId).filter((id):id is string=>typeof id==="string"&&!!id)))].slice(0,50);
  if(!ids.length){if(failure)throw failure.reason;return [];}
  const detailsURL=new URL("https://www.googleapis.com/youtube/v3/videos");
  for(const [k,v] of Object.entries({part:"snippet,contentDetails,status,statistics",id:ids.join(","),key:process.env.YOUTUBE_API_KEY!})) detailsURL.searchParams.set(k,v);
  const details=await getJSON<{items?:YouTubeVideo[]}>(detailsURL,signal);
  const byId=new Map((details.items||[]).map(video=>[video.id,video]));
  const videos=ids.flatMap(id=>{const video=byId.get(id);return video?[{...video,snippet:{...video.snippet,title:load(video.snippet.title).text(),description:load(video.snippet.description||"").text()}}]:[];});
  const selected=selectLearningCandidates(videos.map(youtubeApiCandidate),topic,locale);
  if(!selected.length&&failure)throw failure.reason;
  return selected;
}
export async function discover(input: DiscoverInput, signal: AbortSignal): Promise<ProviderResult> {
  const {provider,topic,locale}=input;
  const start=Date.now();
  if (provider==="freesound"&&!process.env.FREESOUND_API_KEY) return {status:"unavailable",items:[],reason:"credentials",message:"This source has not been connected yet."};
  try {
    if (provider === "art") {
      const result = await discoverArt(topic, signal, getJSON);
      console.info(JSON.stringify({provider,durationMs:Date.now()-start,status:result.status,partial:result.partial}));
      return result;
    }
    if (provider === "freesound") {
      const result = await discoverSounds(topic, locale, signal, getJSON);
      console.info(JSON.stringify({provider,durationMs:Date.now()-start,status:result.status,partial:result.partial}));
      return result;
    }
    const items=await ({wikipedia:()=>wikipedia(topic,signal),youtube:()=>discoverYouTube(topic,locale,signal,apiSignal=>youtubeApi(topic,locale,apiSignal))})[provider]();
    console.info(JSON.stringify({provider,durationMs:Date.now()-start,status:items.length?"ready":"empty"}));
    return {status:items.length?"ready":"empty",items};
  } catch(error) {
    const timeout = signal.aborted || (error instanceof Error && error.name === "TimeoutError");
    const reason = timeout?"timeout":(error instanceof ProviderError||error instanceof WikipediaError||error instanceof YouTubeError)?error.reason:"network";
    console.info(JSON.stringify({provider,durationMs:Date.now()-start,status:"error",reason}));
    return {status:["quota","setup","credentials"].includes(reason)?"unavailable":"error",items:[],reason,retryAfter:error instanceof WikipediaError?error.retryAfter:undefined,message:timeout?"This source took too long. Try it again.":error instanceof ProviderError||error instanceof YouTubeError?error.message:"This source could not be reached. Try again shortly."};
  }
}

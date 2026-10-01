import "server-only";
import { load } from "cheerio";
import { clearWikiCache, wikipedia, WikipediaError } from "./wikipedia";
export { resolveTopic, extractLead } from "./wikipedia";
import { artExclusionsByQuery } from "./aliases";
import { normalize } from "./catalog";
import { learningVideoQuery, selectLearningVideos, videoDurationSeconds } from "./youtube-selection";
import type { YouTubeVideo } from "./youtube-selection";
import type { DiscoverInput, Locale, MediaItem, ProviderResult, TopicCandidate } from "./types";

export class ProviderError extends Error {
  constructor(public reason: "quota" | "timeout" | "network", message: string) { super(message); }
}
const cache = new Map<string, { at: number; value: unknown }>();
export function clearProviderCache() { cache.clear(); clearWikiCache(); }
async function getJSON<T>(url: URL | string, signal: AbortSignal, headers: Record<string,string> = {}): Promise<T> {
  const key = String(url);
  const hit = cache.get(key);
  if (hit && Date.now()-hit.at < 3600000) return hit.value as T;
  const response = await fetch(url, { headers, signal, cache: "no-store" });
  if (response.status === 429 || response.status === 403) throw new ProviderError("quota","This source is temporarily unavailable or has reached its request limit.");
  if (!response.ok) throw new ProviderError("network","This source could not be reached. Try again shortly.");
  const text = await response.text();
  if (text.length > 6_000_000) throw new ProviderError("network","This result is too large to display.");
  const value = JSON.parse(text) as T;
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(key,{at:Date.now(),value});
  return value;
}
async function youtube(topic: TopicCandidate, locale: Locale, signal: AbortSignal): Promise<MediaItem[]> {
  // Independent, short queries avoid ambiguous multi-word OR searches. The two
  // pools cover explanations and illustrative documentaries with at most 50 IDs.
  const pools=await Promise.all([false,true].map(async documentary=>{
    const url=new URL("https://www.googleapis.com/youtube/v3/search");
    for (const [k,v] of Object.entries({part:"snippet",type:"video",order:"relevance",videoEmbeddable:"true",videoSyndicated:"true",safeSearch:"strict",maxResults:"25",q:learningVideoQuery(topic,locale,documentary),relevanceLanguage:locale,key:process.env.YOUTUBE_API_KEY!})) url.searchParams.set(k,v);
    return await getJSON<{items?:{id:{videoId?:string}}[]}>(url,signal);
  }));
  const ids=[...new Set(pools.flatMap(data=>(data.items||[]).map(v=>v.id.videoId).filter((id):id is string=>!!id)))].slice(0,50);
  if(!ids.length)return [];
  const detailsURL=new URL("https://www.googleapis.com/youtube/v3/videos");
  for(const [k,v] of Object.entries({part:"snippet,contentDetails,status,statistics",id:ids.join(","),key:process.env.YOUTUBE_API_KEY!})) detailsURL.searchParams.set(k,v);
  const details=await getJSON<{items?:YouTubeVideo[]}>(detailsURL,signal);
  const byId=new Map((details.items||[]).map(video=>[video.id,video]));
  const videos=ids.flatMap(id=>{const video=byId.get(id);return video?[{...video,snippet:{...video.snippet,title:load(video.snippet.title).text(),description:load(video.snippet.description||"").text()}}]:[];});
  return selectLearningVideos(videos,topic,locale).map(v=>({id:v.id,title:v.snippet.title,creator:v.snippet.channelTitle,sourceUrl:`https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,embedUrl:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}`,previewUrl:v.snippet.thumbnails?.high?.url||v.snippet.thumbnails?.medium?.url,durationSeconds:videoDurationSeconds(v.contentDetails.duration)}));
}
async function freesound(topic: TopicCandidate, signal: AbortSignal): Promise<MediaItem[]> {
  const url=new URL("https://freesound.org/apiv2/search/text/");
  for (const [k,v] of Object.entries({query:topic.englishQuery,filter:'license:("Creative Commons 0" OR "Attribution")',page_size:"10",fields:"id,name,url,username,license,previews"})) url.searchParams.set(k,v);
  type Sound={id:number;name:string;url:string;username:string;license:string;previews:Record<string,string>};
  const data=await getJSON<{results:Sound[]}>(url,signal,{Authorization:`Token ${process.env.FREESOUND_API_KEY}`});
  return (data.results||[]).filter(s=>/\/publicdomain\/zero\/|\/licenses\/by\//.test(s.license)&&s.previews["preview-hq-mp3"]).slice(0,3).map(s=>({id:String(s.id),title:s.name,sourceUrl:s.url,creator:s.username,license:s.license.includes("/zero/")?"CC0":"CC BY",licenseUrl:s.license,previewUrl:s.previews["preview-hq-mp3"]}));
}
async function artworks(topic: TopicCandidate, signal: AbortSignal): Promise<MediaItem[]> {
  const url=new URL("https://api.artic.edu/api/v1/artworks/search");
  url.searchParams.set("params",JSON.stringify({
    query:{bool:{must:[{multi_match:{query:topic.englishQuery,fields:["title^3","subject_titles"],operator:"and"}}],filter:[{term:{is_public_domain:true}},{exists:{field:"image_id"}}]}},
    limit:3,fields:["id","title","image_id","artist_display","date_display","artwork_type_title","is_public_domain"],
  }));
  type Art={id:number;title:string;image_id:string|null;artist_display:string;date_display:string;artwork_type_title:string;is_public_domain:boolean};
  const data=await getJSON<{data:Art[];config:{iiif_url:string}}>(url,signal);
  const excluded=artExclusionsByQuery[normalize(topic.englishQuery)]||[];
  return (data.data||[]).filter(a=>a.is_public_domain&&a.image_id&&!excluded.includes(a.title)).slice(0,3).map(a=>({id:String(a.id),title:a.title,sourceUrl:`https://www.artic.edu/artworks/${a.id}`,previewUrl:`https://www.artic.edu/iiif/2/${encodeURIComponent(a.image_id!)}/full/600,/0/default.jpg`,creator:a.artist_display,date:a.date_display,kind:a.artwork_type_title,license:"Public domain",licenseUrl:"https://www.artic.edu/image-licensing"}));
}
export async function discover(input: DiscoverInput, signal: AbortSignal): Promise<ProviderResult> {
  const {provider,topic,locale}=input;
  const start=Date.now();
  if (provider==="youtube"&&!process.env.YOUTUBE_API_KEY||provider==="freesound"&&!process.env.FREESOUND_API_KEY) return {status:"unavailable",items:[],reason:"credentials",message:"This source has not been connected yet."};
  try {
    const items=await ({wikipedia:()=>wikipedia(topic,signal),youtube:()=>youtube(topic,locale,signal),freesound:()=>freesound(topic,signal),art:()=>artworks(topic,signal)})[provider]();
    console.info(JSON.stringify({provider,durationMs:Date.now()-start,status:items.length?"ready":"empty"}));
    return {status:items.length?"ready":"empty",items};
  } catch(error) {
    const timeout = signal.aborted;
    const reason = timeout?"timeout":(error instanceof ProviderError||error instanceof WikipediaError)?error.reason:"network";
    console.info(JSON.stringify({provider,durationMs:Date.now()-start,status:"error",reason}));
    return {status:reason==="quota"?"unavailable":"error",items:[],reason,retryAfter:error instanceof WikipediaError?error.retryAfter:undefined,message:timeout?"This source took too long. Try it again.":error instanceof ProviderError?error.message:"This source could not be reached. Try again shortly."};
  }
}

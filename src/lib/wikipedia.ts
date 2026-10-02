import "server-only";
import { load } from "cheerio";
import { setTimeout as delay } from "node:timers/promises";
import { defaultTopic, emojiById, normalize } from "./catalog";
import { MetadataCache } from "./metadata-cache";
import { boundedText } from "./bounded-text";
import type { Locale, MediaItem, RelatedResult, Resolution, TopicCandidate } from "./types";

type Page = { index?:number; pageid: number; title: string; missing?: boolean; extract?: string; lastrevid?: number; pageprops?: Record<string,string>; langlinks?: {lang:string; title:string}[]; terms?: {description?:string[]} };
type Query = { query?: { redirects?: {from:string;to:string}[]; pages?: Page[]; search?: {pageid:number; title:string; snippet:string}[] }; error?: unknown };
type HtmlPage = {id:number; title:string; html:string; latest:{id:number}; license:{title:string;url:string}};
export class WikipediaError extends Error {
  constructor(public reason:"quota"|"network"|"timeout",message:string,public retryAfter?:number){super(message);}
}
const cache = new MetadataCache<unknown>();
let cooldownUntil=0, lastStart=0, queue=Promise.resolve();
export function clearWikiCache() { cache.clear(); cooldownUntil=0;lastStart=0; }
function checkCooldown(){
  if(Date.now()<cooldownUntil)throw new WikipediaError("quota","Wikipedia has requested a pause.",Math.ceil((cooldownUntil-Date.now())/1000));
}
function retrySeconds(value:string|null){
  if(!value)return 5;
  const seconds=Number(value);
  return Math.max(1,Number.isFinite(seconds)?seconds:Math.ceil((Date.parse(value)-Date.now())/1000)||5);
}
function rethrowPause(error:unknown){if(error instanceof WikipediaError && error.retryAfter)throw error;}

const headers = () => ({"User-Agent":process.env.WIKIMEDIA_USER_AGENT || "EmojiDreamMaker/0.2 (personal educational app)"});
async function articleHTML(title:string,locale:Locale,signal:AbortSignal) {
  try{return (await json<HtmlPage>(restURL(locale,title),signal)).html;}
  catch(error){
    rethrowPause(error);signal.throwIfAborted();
    const result=await json<{parse:{text:string}}>(apiURL(locale,{action:"parse",page:title,redirects:"1",prop:"text",disableeditsection:"1"}),signal);
    return result.parse.text;
  }
}
const restURL = (locale:Locale, title:string) => `https://${locale}.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(title)}/with_html`;
function apiURL(locale:Locale, params:Record<string,string>) {
  const url=new URL(`https://${locale}.wikipedia.org/w/api.php`);
  for(const [k,v] of Object.entries({action:"query",format:"json",formatversion:"2",...params}))url.searchParams.set(k,v);
  return url;
}
function waitForTurn(previous: Promise<void>, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    previous.then(() => { signal.removeEventListener("abort", abort); resolve(); });
    if (signal.aborted) { signal.removeEventListener("abort", abort); abort(); }
  });
}
function json<T>(url:URL|string, signal:AbortSignal):Promise<T> {
  return cache.get(String(url), signal, sharedSignal => fetchJSON(url, sharedSignal)) as Promise<T>;
}
async function fetchJSON(url: URL | string, signal: AbortSignal): Promise<unknown> {
  checkCooldown();
  // Serialize uncached requests; repeated calls during a provider cooldown use
  // the cache or return immediately instead of exhausting the same rate limit.
  const previous=queue;let release!:()=>void;
  queue=new Promise<void>(resolve=>{release=resolve;});
  try { await waitForTurn(previous, signal); }
  catch (error) {
    // A cancelled waiter must not let later jobs overtake the active request.
    void previous.then(release);
    throw error;
  }
  try {
    signal.throwIfAborted();checkCooldown();
    const wait=Math.max(0,350-(Date.now()-lastStart));
    if(wait)await delay(wait,undefined,{signal});
    lastStart=Date.now();
    const response=await fetch(url,{headers:headers(),signal:AbortSignal.any([signal,AbortSignal.timeout(2200)]),cache:"no-store"});
    if(response.status===429||response.status===503){
      const seconds=retrySeconds(response.headers.get("retry-after"));
      cooldownUntil=Date.now()+seconds*1000;
      throw new WikipediaError("quota","Wikipedia has requested a pause.",seconds);
    }
    if(!response.ok)throw new WikipediaError("network",`Wikipedia HTTP ${response.status}`);
    const text=await boundedText(response,6_000_000);
    const value=JSON.parse(text);
    if(value.error)throw new Error("Wikipedia API error");
    return value;
  }finally{release();}
}

const usable=(page:Page) => !page.missing && page.pageid>0 && !Object.hasOwn(page.pageprops||{},"disambiguation") && !/soft redirect|redirección suave/i.test(description(page)||"");
const description=(page:Page) => page.terms?.description?.[0] || page.pageprops?.["wikibase-shortdesc"];
async function pages(titles:string[],locale:Locale,signal:AbortSignal,extract=true) {
  const data=await json<Query>(apiURL(locale,{titles:titles.map(title=>title.replaceAll("|"," ")).join("|"),redirects:"1",prop:`info|pageprops|langlinks|pageterms${extract?"|extracts":""}`,lllang:"en",lllimit:"max",wbptterms:"description",...(extract?{exintro:"1",explaintext:"1",exlimit:"1"}:{})}),signal);
  const redirects=new Map((data.query?.redirects||[]).map(r=>[normalize(r.from),r.to]));
  const order=titles.map(title=>{let target=title;const seen=new Set<string>();while(redirects.has(normalize(target))&&!seen.has(target)){seen.add(target);target=redirects.get(normalize(target))!;}return normalize(target);});
  return (data.query?.pages||[]).sort((a,b)=>{const ai=order.indexOf(normalize(a.title)),bi=order.indexOf(normalize(b.title));return (ai<0?99:ai)-(bi<0?99:bi);});
}
function candidate(page:Page,locale:Locale,fallback:string):TopicCandidate {
  return {label:page.title,query:page.title,englishQuery:locale==="en"?page.title:page.langlinks?.find(l=>l.lang==="en")?.title || fallback,language:locale,wikiTitle:page.title,wikiId:page.pageid,description:description(page)};
}
function matches(query:string,title:string) {
  return normalize(title.replaceAll("_"," "))===normalize(query.replaceAll("_"," "));
}
async function search(query:string,locale:Locale,signal:AbortSignal):Promise<TopicCandidate[]> {
  try {
    const data=await json<Query>(apiURL(locale,{generator:"search",gsrsearch:query,gsrnamespace:"0",gsrlimit:"5",prop:"pageprops|langlinks|pageterms",lllang:"en",lllimit:"max",wbptterms:"description"}),signal);
    return (data.query?.pages||[]).filter(usable).sort((a,b)=>(a.index||0)-(b.index||0)).map(p=>candidate(p,locale,p.title));
  } catch(error) {
    rethrowPause(error);signal.throwIfAborted();
    const url=new URL(`https://${locale}.wikipedia.org/w/rest.php/v1/search/page`);
    url.searchParams.set("q",query);url.searchParams.set("limit","5");
    const data=await json<{pages:{id:number;key:string;title:string;description?:string;matched_title?:string}[]}>(url,signal);
    return (data.pages||[]).filter(p=>!/(disambiguation|desambiguación)/i.test(p.title)).map(p=>({label:p.title,query:p.title,englishQuery:p.title,language:locale,wikiTitle:p.key,wikiId:p.id,description:p.description,suggested:!matches(query,p.matched_title||p.title)}));
  }
}
export async function resolveTopic(emojiId:string,locale:Locale,signal:AbortSignal,query?:string):Promise<Resolution> {
  const local=defaultTopic(emojiById.get(emojiId)!,locale);
  const fallback=query?{label:query,query,englishQuery:query,language:locale}:local;
  let primary:TopicCandidate=fallback, alternatives:TopicCandidate[]=[];
  try {
    const direct=(await pages([fallback.query],locale,signal)).find(usable);
    if(direct)primary=candidate(direct,locale,fallback.englishQuery);
    // Explicit correction search also exposes choices; ordinary direct matches
    // avoid a search and reuse the cached lead in the discovery request.
    if(query || !direct){
      const found=await search(fallback.query,locale,signal);
      const exact=found.find(c=>matches(fallback.query,c.label)||c.suggested===false);
      if(!direct && exact)primary=exact;
      alternatives=found.filter(c=>c.wikiId!==primary.wikiId).map(c=>({...c,suggested:true}));
    }
  }catch{ /* Keep the chosen concept; discovery tries the alternate endpoint. */ }
  if(emojiId==="2764"&&!query)alternatives.unshift({label:locale==="es"?"Corazón humano":"Human heart",query:locale==="es"?"Corazón humano":"Human heart",englishQuery:"Human heart",language:locale,wikiTitle:locale==="es"?"Corazón humano":"Human heart"});
  return {defaultTopic:primary,alternatives:alternatives.slice(0,4)};
}
export function summarize(text:string,locale:Locale) {
  // TextExtracts occasionally includes MathML fallback TeX after its visible
  // symbol. Drop those balanced markup blocks, retaining the surrounding prose.
  let start:number;
  while((start=text.search(/\{\s*\\displaystyle/))>=0){
    let depth=0,end=start;
    for(;end<text.length;end++){if(text[end]==="{")depth++;if(text[end]==="}"&&--depth===0){end++;break;}}
    text=text.slice(0,start)+text.slice(end);
  }
  text=text.replace(/[\u200B\uFEFF]/g,"").replace(/\s+/g," ").trim();
  const sentences=[...new Intl.Segmenter(locale,{granularity:"sentence"}).segment(text)].map(s=>s.segment.trim()).filter(Boolean);
  const chosen:string[]=[];let words=0;
  for(const sentence of sentences.slice(0,4)){const count=sentence.split(/\s+/).length;if(words+count>150)break;chosen.push(sentence);words+=count;}
  if(chosen.length)return chosen.join(" ");
  return text.split(/\s+/).slice(0,150).join(" ")+(text.split(/\s+/).length>150?"…":"");
}
export function extractLead(html: string, locale: Locale) {
  const $ = load(html);
  $("table, aside, nav, figure, style, script, sup, .hatnote, .mw-empty-elt, .shortdescription, .metadata, .coordinates").remove();
  const lead = $('section[data-mw-section-id="0"]');
  const paragraphs: string[] = [];
  if (lead.length) lead.find("p").each((_,el)=>{const text=$(el).text().replace(/\s+/g," ").trim(); if(text.length>40) paragraphs.push(text);});
  else {
    $("body").find("p, h2").each((_,el)=>{if(el.tagName==="h2") return false; const text=$(el).text().replace(/\s+/g," ").trim(); if(text.length>40) paragraphs.push(text);});
  }
  return summarize(paragraphs.join(" "),locale);
}
function item(page:Page,locale:Locale):MediaItem {
  return {id:String(page.pageid),title:page.title,excerpt:summarize(page.extract||"",locale),language:locale,sourceUrl:`https://${locale}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,revisionUrl:page.lastrevid?`https://${locale}.wikipedia.org/w/index.php?oldid=${page.lastrevid}`:undefined,license:"CC BY-SA 4.0",licenseUrl:"https://creativecommons.org/licenses/by-sa/4.0/"};
}
async function read(title:string,locale:Locale,signal:AbortSignal):Promise<MediaItem[]> {
  try {
    const found=await pages([title],locale,signal);
    const page=found.find(usable);
    if(page?.extract)return [item(page,locale)];
    if(found.some(p=>p.missing || Object.hasOwn(p.pageprops||{},"disambiguation")))return [];
  }catch(error){rethrowPause(error);signal.throwIfAborted();}
  const page=await json<HtmlPage>(restURL(locale,title),signal);
  // REST disambiguation pages must not masquerade as a concept summary.
  if(/mw:PageProp\/disambiguation/.test(page.html))return [];
  const excerpt=extractLead(page.html,locale);
  if(!excerpt)return [];
  return [{id:String(page.id),title:page.title,excerpt,language:locale,sourceUrl:`https://${locale}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,revisionUrl:`https://${locale}.wikipedia.org/w/index.php?oldid=${page.latest.id}`,license:page.license.title,licenseUrl:new URL(page.license.url,`https://${locale}.wikipedia.org`).href}];
}
export async function wikipedia(topic:TopicCandidate,signal:AbortSignal):Promise<MediaItem[]> {
  let failure:unknown;
  try {const items=await read(topic.wikiTitle||topic.query,topic.language,signal);if(items.length)return items;}catch(error){rethrowPause(error);failure=error;}
  if(topic.language==="es"&&!signal.aborted){
    try{const items=await read(topic.englishQuery,"en",signal);if(items.length)return items;}catch(error){rethrowPause(error);failure=error;}
  }
  if(failure)throw failure;
  return [];
}
// Only actual article links in the introduction / See also section are used.
export function relatedTitles(html:string,title:string):string[] {
  const $=load(html);
  $("table,aside,nav,figure,sup,.hatnote,.metadata,.reflist").remove();
  const links: string[]=[];
  const collect=(selector:string)=>$(selector).each((_,el)=>{
    const href=$(el).attr("href")||"";
    if($(el).hasClass("new")||! /^(\.\/|\/wiki\/)/.test(href))return;
    try{const target=decodeURIComponent(href.replace(/^(\.\/|\/wiki\/)/,"").split(/[?#]/)[0]).replaceAll("_"," ");
      if(target && target.length<=150 && !target.includes(":") && normalize(target)!==normalize(title) && !/^(list of|anexo:)/i.test(target) && !links.includes(target))links.push(target);
    }catch{/* Ignore malformed article links. */}
  });
  // Lead links offer the clearest conceptual context; See also widens it.
  collect('section[data-mw-section-id="0"] p a');
  if(!links.length)collect("body > p a, .mw-parser-output > p a");
  const leadLinks=[...links];links.length=0;
  $('[id="See_also"], [id="Véase_también"]').each((_,el)=>{
    const section=$(el).closest("section");section.addClass("related-section");
    if(!section.length)$(el).closest("h2, .mw-heading").nextUntil("h2, .mw-heading").addClass("related-section");
  });
  collect(".related-section li a");
  return [...new Set([...leadLinks.slice(0,3),...links.slice(0,3),...leadLinks.slice(3),...links.slice(3)])].slice(0,10);
}
export async function relatedTopics(title:string,locale:Locale,signal:AbortSignal):Promise<RelatedResult> {
  try {
    const html=await articleHTML(title,locale,signal);
    const titles=relatedTitles(html,title);
    if(!titles.length)return {status:"empty",topics:[]};
    const metadata=await pages(titles,locale,signal,false);
    const topics=metadata.filter(usable).filter(p=>normalize(p.title)!==normalize(title)).slice(0,6).map(p=>candidate(p,locale,p.title));
    return {status:topics.length?"ready":"empty",topics};
  }catch{return {status:"error",topics:[]};}
}

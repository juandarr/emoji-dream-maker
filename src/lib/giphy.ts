import type { Locale, ProviderResult } from "./types";
export async function searchGiphy(query: string, locale: Locale, signal: AbortSignal): Promise<ProviderResult> {
  const key=process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  if(!key) return {status:"unavailable",items:[],reason:"credentials"};
  try {
    const url=new URL("https://api.giphy.com/v1/gifs/search");
    for(const [k,v] of Object.entries({api_key:key,q:query.slice(0,50),rating:"g",limit:"6",lang:locale})) url.searchParams.set(k,v);
    const response=await fetch(url,{signal,cache:"no-store"});
    if(response.status===429||response.status===403) return {status:"unavailable",items:[],reason:"quota"};
    if(!response.ok) throw new Error("Unavailable");
    type Gif={id:string;title:string;url:string;images:{fixed_width:{url:string};original:{url:string}};user?:{display_name:string}};
    const data=await response.json() as {data:Gif[]};
    const items=(data.data||[]).slice(0,6).map(g=>({id:g.id,title:g.title||"GIF",sourceUrl:g.url,previewUrl:g.images.fixed_width.url,creator:g.user?.display_name}));
    return {status:items.length?"ready":"empty",items};
  } catch { return {status:"error",items:[],reason:signal.aborted?"timeout":"network"}; }
}

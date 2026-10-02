import type { Locale, ProviderResult } from "./types";
import { rankGifs, type GifCandidate, type GifMatchContext } from "./gif-selection";

type Gif = { id?: string; title?: string; url?: string; slug?: string; alt_text?: string;
  images?: { fixed_width?: { url?: string; webp?: string; size?: string; webp_size?: string; frames?: string }; original?: { url?: string; frames?: string } };
  user?: { display_name?: string } };
const httpsURL = (value?: string) => {
  try { const url = new URL(value || ""); return url.protocol === "https:" ? url.href : undefined; }
  catch { return undefined; }
};

export async function searchGiphy(query: string, locale: Locale, signal: AbortSignal, context?: GifMatchContext): Promise<ProviderResult> {
  const key=process.env.NEXT_PUBLIC_GIPHY_API_KEY;
  if(!key) return {status:"unavailable",items:[],reason:"credentials"};
  try {
    const url=new URL("https://api.giphy.com/v1/gifs/search");
    for(const [k,v] of Object.entries({api_key:key,q:query.slice(0,50),rating:"g",limit:"25",lang:locale})) url.searchParams.set(k,v);
    const response=await fetch(url,{signal,cache:"no-store"});
    if(response.status===429||response.status===403) return {status:"unavailable",items:[],reason:"quota"};
    if(!response.ok) throw new Error("Unavailable");
    const data=await response.json() as {data?: Gif[]};
    if (!Array.isArray(data.data)) throw new Error("Invalid response");
    const candidates: GifCandidate[] = data.data.flatMap(g => {
      const sourceUrl = httpsURL(g?.url);
      const rendition = httpsURL(g?.images?.fixed_width?.url) ? g.images?.fixed_width : g?.images?.original;
      const previewUrl = httpsURL(rendition?.url);
      if (!g?.id || !sourceUrl || !previewUrl || rendition?.frames === "1" || g.images?.original?.frames === "1") return [];
      const fixed=g.images?.fixed_width;
      const previewWebpUrl=rendition===fixed&&(!Number(fixed?.size)||!Number(fixed?.webp_size)||Number(fixed?.webp_size)<Number(fixed?.size))?httpsURL(fixed?.webp):undefined;
      return [{ id: g.id, title: g.title || "GIF", sourceUrl, previewUrl, previewWebpUrl,
        creator: g.user?.display_name, description: g.alt_text, slug: g.slug }];
    });
    const items=rankGifs(candidates,query,locale,context);
    return {status:items.length?"ready":"empty",items};
  } catch { return {status:"error",items:[],reason:signal.aborted?"timeout":"network"}; }
}

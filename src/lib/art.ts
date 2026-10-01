import "server-only";
import { load } from "cheerio";
import { artSearchPlan, rankArt } from "./art-selection";
import type { ArtCandidate } from "./art-selection";
import type { ProviderResult, TopicCandidate } from "./types";

type SourceResult = { candidates: ArtCandidate[]; partial: boolean };
type GetJSON = <T>(url: URL | string, signal: AbortSignal) => Promise<T>;
const text = (value?: string | null) => value ? load(value).text().trim() : "";
function trustedURL(value: string | undefined, hosts: string[]) {
  try { const url = new URL(value || ""); return url.protocol === "https:" && hosts.includes(url.hostname) ? url.href : undefined; } catch { return undefined; }
}
type ClevelandArt = {
  id: number; title: string; series?: string; share_license_status: string; type?: string; technique?: string;
  description?: string; creation_date?: string; url?: string;
  creators?: { description: string }[];
  images?: { web?: { url: string; width: string; height: string }; print?: { url: string } };
};
async function cleveland(topic: TopicCandidate, signal: AbortSignal, getJSON: GetJSON): Promise<SourceResult> {
  const plan = artSearchPlan(topic);
  const searches = await Promise.allSettled((plan.generalPainting ? ["painting"] : plan.queries).map(async query => {
    const url = new URL("https://openaccess-api.clevelandart.org/api/artworks/");
    for (const [key, value] of Object.entries({ q: query, cc0: "", has_image: "1", limit: "36", fields: "id,title,share_license_status,type,technique,series,description,images,url,creators,creation_date" })) url.searchParams.set(key, value);
    if (plan.generalPainting) { url.searchParams.delete("q"); url.searchParams.set("type", "Painting"); }
    const data = await getJSON<{ data: ClevelandArt[] }>(url, signal);
    if (!Array.isArray(data.data)) throw new Error("Invalid museum response");
    return data.data;
  }));
  const fulfilled = searches.filter(result => result.status === "fulfilled");
  if (!fulfilled.length) throw (searches[0] as PromiseRejectedResult).reason;
  const candidates = fulfilled.flatMap(result => result.value).flatMap(art => {
    const previewUrl = trustedURL(art.images?.web?.url, ["openaccess-cdn.clevelandart.org"]);
    const imageUrl = trustedURL(art.images?.print?.url, ["openaccess-cdn.clevelandart.org"]) || previewUrl;
    const sourceUrl = trustedURL(art.url, ["clevelandart.org", "www.clevelandart.org"]);
    if (art.share_license_status !== "CC0" || !previewUrl || !sourceUrl || !art.title) return [];
    const width = Number(art.images?.web?.width), height = Number(art.images?.web?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || Math.max(width, height) < 600) return [];
    return [{ id: `cleveland:${art.id}`, title: text(art.title), previewUrl, imageUrl, sourceUrl,
      creator: art.creators?.map(creator => text(creator.description)).join("; "), date: art.creation_date,
      kind: art.type, series: art.series, description: text(art.description), collection: "Cleveland Museum of Art",
      license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" }];
  });
  return { candidates, partial: fulfilled.length !== searches.length };
}
type MetArt = {
  objectID: number; title: string; isPublicDomain: boolean; primaryImage?: string; primaryImageSmall?: string;
  artistDisplayName?: string; objectDate?: string; classification?: string; objectName?: string; medium?: string;
  tags?: { term: string }[] | null;
};
async function met(topic: TopicCandidate, signal: AbortSignal, getJSON: GetJSON): Promise<SourceResult> {
  const plan = artSearchPlan(topic);
  const searches = await Promise.allSettled((plan.generalPainting ? ["painting"] : plan.queries).map(async query => {
    const url = new URL("https://collectionapi.metmuseum.org/public/collection/v1.1/search");
    for (const [key, value] of Object.entries({ q: query, hasImages: "true", limit: "12" })) url.searchParams.set(key, value);
    if (plan.generalPainting) { url.searchParams.delete("q"); url.searchParams.set("medium", "Paintings"); }
    const data = await getJSON<{ objectIDs: number[] | null }>(url, signal);
    if (data.objectIDs !== null && !Array.isArray(data.objectIDs)) throw new Error("Invalid museum response");
    return data.objectIDs || [];
  }));
  const pools = searches.filter(result => result.status === "fulfilled").map(result => result.value);
  if (!pools.length) throw (searches[0] as PromiseRejectedResult).reason;
  // Interleave queries so aliases get candidates even for a very common first term.
  const ids = [...new Set(Array.from({ length: 12 }, (_, index) => pools.flatMap(pool => pool[index] ? [pool[index]] : [])).flat())].slice(0, 24);
  const details: PromiseSettledResult<MetArt>[] = [];
  // Four concurrent requests keep the museum's traffic bounded.
  for (let index = 0; index < ids.length; index += 4) {
    if (signal.aborted) break;
    details.push(...await Promise.allSettled(ids.slice(index, index + 4).map(id => getJSON<MetArt>(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, signal))));
  }
  if (details.length && details.every(result => result.status === "rejected")) throw (details[0] as PromiseRejectedResult).reason;
  const candidates = details.flatMap(result => {
    if (result.status !== "fulfilled") return [];
    const art = result.value;
    const imageUrl = trustedURL(art.primaryImage, ["images.metmuseum.org"]);
    const previewUrl = trustedURL(art.primaryImageSmall, ["images.metmuseum.org"]) || imageUrl;
    if (!art.isPublicDomain || !previewUrl || !imageUrl || !art.title || !Number.isInteger(art.objectID)) return [];
    return [{ id: `met:${art.objectID}`, title: text(art.title), previewUrl, imageUrl,
      sourceUrl: `https://www.metmuseum.org/art/collection/search/${art.objectID}`, creator: text(art.artistDisplayName),
      date: art.objectDate, kind: art.classification || art.objectName || art.medium, subjects: art.tags?.map(tag => text(tag.term)),
      collection: "The Metropolitan Museum of Art", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" }];
  });
  if (signal.aborted && !details.some(result => result.status === "fulfilled")) signal.throwIfAborted();
  return { candidates, partial: pools.length !== searches.length || details.length < ids.length || details.some(result => result.status === "rejected") };
}
export async function discoverArt(topic: TopicCandidate, signal: AbortSignal, getJSON: GetJSON): Promise<ProviderResult> {
  const sourceSignal = AbortSignal.any([signal, AbortSignal.timeout(6500)]);
  const sources = await Promise.allSettled([cleveland(topic, sourceSignal, getJSON), met(topic, sourceSignal, getJSON)]);
  signal.throwIfAborted();
  const successful = sources.filter(result => result.status === "fulfilled");
  if (!successful.length) {
    if (sourceSignal.aborted) return { status: "error", items: [], reason: "timeout" };
    throw (sources[0] as PromiseRejectedResult).reason;
  }
  const items = rankArt(successful.flatMap(result => result.value.candidates), topic);
  return { status: items.length ? "ready" : "empty", items, partial: sources.some(result => result.status === "rejected" || result.value.partial) };
}

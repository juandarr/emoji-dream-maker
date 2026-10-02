import "server-only";
import { load } from "cheerio";
import { soundSearchPlan } from "./sound-associations";
import { selectSounds } from "./sound-selection";
import type { SoundCandidate } from "./sound-selection";
import type { Locale, ProviderResult, TopicCandidate } from "./types";

type FetchJSON = <T>(url: URL, signal: AbortSignal, headers: Record<string, string>) => Promise<T>;

export async function discoverSounds(topic: TopicCandidate, locale: Locale, signal: AbortSignal, getJSON: FetchJSON): Promise<ProviderResult> {
  const plan = soundSearchPlan(topic);
  signal.throwIfAborted();
  if (!plan.subject) return { status: "empty", items: [] };
  // At most three searches, 30 candidates each; cached by the shared provider
  // loader. All requests use the existing gallery deadline/cancellation signal.
  const pools = await Promise.allSettled(plan.cues.map(async (cue): Promise<SoundCandidate[]> => {
    const url = new URL("https://freesound.org/apiv2/search/");
    for (const [key, value] of Object.entries({
      query: cue.query, filter: 'license:("Creative Commons 0" OR "Attribution") duration:[0.3 TO 180]',
      sort: "score", group_by_pack: "1", page_size: "30",
      fields: "id,name,url,username,license,previews,tags,description,duration,pack,md5,avg_rating,num_ratings,num_downloads",
    })) url.searchParams.set(key, value);
    // Leave time to return other successful scenes before the gallery deadline.
    const querySignal = AbortSignal.any([signal, AbortSignal.timeout(5500)]);
    const data = await getJSON<{ results?: SoundCandidate[] }>(url, querySignal, { Authorization: `Token ${process.env.FREESOUND_API_KEY}` });
    if (!Array.isArray(data.results)) throw new Error("Invalid sound search response");
    return data.results.map(sound => ({ ...sound, description: load((sound.description || "").slice(0, 5000)).text() }));
  }));
  signal.throwIfAborted();
  const successful = pools.filter((pool): pool is PromiseFulfilledResult<SoundCandidate[]> => pool.status === "fulfilled");
  const failed = pools.filter((pool): pool is PromiseRejectedResult => pool.status === "rejected");
  const items = selectSounds(successful.flatMap(pool => pool.value), topic, locale);
  if (!items.length && failed.length) throw failed[0].reason;
  return { status: items.length ? "ready" : "empty", items, ...(failed.length ? { partial: true } : {}) };
}

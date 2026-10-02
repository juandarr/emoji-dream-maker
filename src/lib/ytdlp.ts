import "server-only";
import { MetadataCache } from "./metadata-cache";
import { YouTubeError } from "./youtube-error";
import { searchWithWorker } from "./ytdlp-worker";
import { runYtDlp } from "./ytdlp-process";
import { learningVideoQuery, selectSearchLearningCandidates } from "./youtube-selection";
import type { VideoCandidate } from "./youtube-selection";
import type { Locale, TopicCandidate } from "./types";

const cache = new MetadataCache<VideoCandidate[]>();
export function clearYtDlpCache() { cache.clear(); }
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const string = (value: unknown) => typeof value === "string" ? value : undefined;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
const boolean = (value: unknown) => typeof value === "boolean" ? value : undefined;

export function ytDlpCandidate(value: unknown): VideoCandidate | undefined {
  const data = record(value);
  if (!data || typeof data.id !== "string" || !/^[\w-]{11}$/.test(data.id) || typeof data.title !== "string" || !data.title.trim()) return;
  const thumbnails = Array.isArray(data.thumbnails) ? data.thumbnails.map(record).filter(item => item !== undefined) : [];
  const thumbnail = string(data.thumbnail) || string(thumbnails.at(-1)?.url);
  const subtitles = record(data.subtitles);
  const formats = Array.isArray(data.formats) ? data.formats.map(record).filter(item => item !== undefined) : undefined;
  const categories = Array.isArray(data.categories) ? data.categories : undefined;
  const liveStatus = string(data.live_status);
  return {
    id: data.id, title: data.title, description: string(data.description),
    channelId: string(data.channel_id) || "", creator: string(data.channel) || string(data.uploader) || "",
    thumbnail: thumbnail?.startsWith("https://") ? thumbnail : undefined,
    durationSeconds: number(data.duration), language: string(data.language), views: number(data.view_count), likes: number(data.like_count),
    embeddable: boolean(data.playable_in_embed), availability: string(data.availability),
    live: liveStatus === undefined ? boolean(data.is_live) : liveStatus !== "not_live" && liveStatus !== "was_live",
    ageRestricted: number(data.age_limit) === undefined ? undefined : Number(data.age_limit) > 0,
    captioned: subtitles === undefined ? undefined : Object.values(subtitles).some(tracks => Array.isArray(tracks) && tracks.length > 0),
    hd: formats === undefined ? undefined : formats.some(format => (number(format.height) ?? 0) >= 720),
    musicCategory: categories === undefined ? undefined : categories.includes("Music"),
  };
}

async function search(query: string, locale: Locale, signal: AbortSignal) {
  return cache.get(JSON.stringify([process.env.YTDLP_PATH || "yt-dlp", "search", query, locale]), signal, async sharedSignal => {
    const raw = record(process.env.YTDLP_PYTHON_ARCHIVE ? await searchWithWorker(query, locale, sharedSignal) : await runYtDlp(["--flat-playlist", "--dump-single-json", "--extractor-args", `youtube:lang=${locale}`, "--", `ytsearch20:${query}`], sharedSignal));
    if (!raw || !Array.isArray(raw.entries)) throw new YouTubeError("network", "The video search returned invalid results.");
    const candidates = raw.entries.slice(0, 20).map(ytDlpCandidate).filter(item => item !== undefined);
    if (raw.entries.length && !candidates.length) throw new YouTubeError("network", "The video search returned unusable results.");
    return candidates;
  });
}
function searchQuery(topic: TopicCandidate, locale: Locale, alternate: boolean) {
  if (alternate && /^(painting|pintura)$/i.test(topic.englishQuery)) return `${topic.query} ${locale === "es" ? "historia del arte" : "art history"}`;
  if (alternate && /^(space|outer space)$/i.test(topic.englishQuery)) return locale === "es" ? "universo astronomía explicación" : "universe astronomy explained";
  return learningVideoQuery(topic, locale, alternate);
}

export async function ytDlpVideos(topic: TopicCandidate, locale: Locale, signal: AbortSignal): Promise<VideoCandidate[]> {
  const controller = new AbortController();
  const batchSignal = AbortSignal.any([signal, controller.signal]);
  const pool: VideoCandidate[] = [];
  try {
    // Search listings already include titles, channel IDs, duration and views.
    // Avoid six serial watch-page extractions before showing the cards.
    const results = await Promise.allSettled([false, true].map(documentary =>
      search(searchQuery(topic, locale, documentary), locale, batchSignal)));
    // Keep relevance ties stable regardless of which network request finishes first.
    for (const result of results) if (result.status === "fulfilled") pool.push(...result.value);
    signal.throwIfAborted();
    let selected = selectSearchLearningCandidates(pool, topic, locale);
    if (selected.length < 3 && locale !== "en") {
      // A narrower localized pool may miss good educators. Fill from the same
      // concept in English, retaining local choices and never duplicating IDs.
      const english = { ...topic, query: topic.englishQuery, label: topic.englishQuery };
      try {
        const extra = selectSearchLearningCandidates(await search(learningVideoQuery(english, "en"), "en", batchSignal), topic, locale);
        selected = [...selected, ...extra.filter(video => !selected.some(item => item.id === video.id))].slice(0, 3);
      } catch { signal.throwIfAborted(); }
    }
    if (!selected.length && !pool.length && results.every(result => result.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
    return selected;
  } finally { controller.abort(); }
}

import "server-only";
import { readVideoCache, writeVideoCache } from "./video-disk-cache";
import { videoKey } from "./video-key";
import { MetadataCache } from "./metadata-cache";
import { clearYtDlpCache, ytDlpVideos } from "./ytdlp";
import { YouTubeError } from "./youtube-error";
import type { VideoCandidate } from "./youtube-selection";
import type { Locale, MediaItem, TopicCandidate } from "./types";

// Share partial work in flight, but let a retry recover a failed search pool.
const cache = new MetadataCache<MediaItem[]>(3_600_000, 256, items => items.length === 3);
export function clearYouTubeCache() { cache.clear(); clearYtDlpCache(); }

async function budget<T>(ms: number, parent: AbortSignal, load: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const signal = AbortSignal.any([parent, controller.signal]);
  try { return await load(signal); }
  catch (error) {
    parent.throwIfAborted();
    if (controller.signal.aborted) throw new YouTubeError("timeout", "The video search took too long.");
    throw error;
  } finally { clearTimeout(timer); controller.abort(); }
}

export function discoverYouTube(topic: TopicCandidate, locale: Locale, signal: AbortSignal,
  api: (signal: AbortSignal) => Promise<VideoCandidate[]>): Promise<MediaItem[]> {
  const mode = process.env.YOUTUBE_PROVIDER || "auto";
  if (!["auto", "yt-dlp", "api"].includes(mode)) throw new YouTubeError("setup", "The video search configuration is invalid.");
  const key = JSON.stringify([mode, process.env.YTDLP_PATH || "yt-dlp", process.env.YTDLP_PYTHON_ARCHIVE || "", process.env.YOUTUBE_API_KEY || "", videoKey(topic, locale), "search-ranking-v5"]);
  return cache.get(key, signal, async sharedSignal => {
    const saved = await readVideoCache(key);
    sharedSignal.throwIfAborted();
    if (saved) return saved;
    let videos: VideoCandidate[];
    if (mode === "api") {
      if (!process.env.YOUTUBE_API_KEY) throw new YouTubeError("credentials", "The YouTube Data API is not connected.");
      videos = await budget(8000, sharedSignal, api);
    } else {
      try { videos = await budget(8000, sharedSignal, stageSignal => ytDlpVideos(topic, locale, stageSignal)); }
      catch (error) {
        sharedSignal.throwIfAborted();
        if (mode !== "auto" || !process.env.YOUTUBE_API_KEY) throw error;
        videos = await budget(8000, sharedSignal, api);
      }
    }
    const items = videos.map(video => ({ id: video.id, title: video.title, creator: video.creator,
      sourceUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}`,
      previewUrl: video.thumbnail, durationSeconds: video.durationSeconds }));
    await writeVideoCache(key, items);
    return items;
  });
}

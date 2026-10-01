"use client";

import { MetadataCache } from "./metadata-cache";
import { videoKey } from "./video-key";
import type { Locale, ProviderResult, TopicCandidate } from "./types";

const cache = new MetadataCache<ProviderResult>(3_600_000, 256);
export function loadVideos(emojiId: string, topic: TopicCandidate, locale: Locale, signal: AbortSignal) {
  return cache.get(videoKey(topic, locale), signal, async sharedSignal => {
    const response = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emojiId, topic, locale, provider: "youtube" }),
      signal: AbortSignal.any([sharedSignal, AbortSignal.timeout(17_500)]) });
    if (!response.ok) throw new Error("Video search unavailable");
    const result = await response.json() as ProviderResult;
    // A retry should actually retry failed/incomplete discoveries.
    if (result.status !== "ready" || result.items.length !== 3) throw new VideoResultError(result);
    return result;
  }).catch(error => {
    if (error instanceof VideoResultError) return error.result;
    throw error;
  });
}
class VideoResultError extends Error {
  constructor(readonly result: ProviderResult) { super("Incomplete video selection"); }
}

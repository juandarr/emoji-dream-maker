import type { Locale, TopicCandidate } from "./types";

// Wikipedia enrichment must not restart an otherwise identical video search.
export function videoKey(topic: TopicCandidate, locale: Locale) {
  return JSON.stringify([locale, topic.query.trim().toLowerCase(), topic.englishQuery.trim().toLowerCase()]);
}

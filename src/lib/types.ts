export type Locale = "en" | "es";
export type Provider = "wikipedia" | "youtube" | "giphy" | "freesound" | "art";
export type Variant = { id: string; glyph: string; labels: Record<Locale, string> };
export type EmojiRecord = {
  id: string; glyph: string; labels: Record<Locale, string>;
  keywords: Record<Locale, string[]>; group: number; order: number;
  variants: Variant[]; association?: Record<Locale, string>;
};
export type TopicCandidate = {
  label: string; language: Locale; englishQuery: string; query: string;
  wikiTitle?: string; wikiId?: number; suggested?: boolean; description?: string;
};
export type RelatedResult = { status: "ready" | "empty" | "error"; topics: TopicCandidate[] };
export type Resolution = { defaultTopic: TopicCandidate; alternatives: TopicCandidate[] };
export type MediaItem = {
  id: string; title: string; sourceUrl: string; previewUrl?: string; embedUrl?: string;
  creator?: string; license?: string; licenseUrl?: string; date?: string; kind?: string;
  excerpt?: string; revisionUrl?: string; language?: Locale;
  durationSeconds?: number;
};
export type ProviderStatus = "loading" | "ready" | "empty" | "unavailable" | "error";
export type ProviderResult = { status: ProviderStatus; items: MediaItem[]; message?: string; retryAfter?: number; reason?: "credentials" | "setup" | "quota" | "timeout" | "network" };
export type Discovery = { emojiId: string; topic: TopicCandidate; at: number };
export type DiscoverInput = { emojiId: string; locale: Locale; topic: TopicCandidate; provider: Exclude<Provider, "giphy"> };

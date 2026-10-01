import type { Locale, TopicCandidate } from "./types";
import { learningChannels } from "./youtube-channels";

export type YouTubeVideo = {
  id: string;
  snippet: {
    title: string; description?: string; channelTitle: string; channelId: string;
    liveBroadcastContent?: string; defaultAudioLanguage?: string; defaultLanguage?: string; categoryId?: string;
    thumbnails?: { medium?: { url: string }; high?: { url: string } };
  };
  contentDetails: {
    duration: string; definition?: string; caption?: string;
    contentRating?: { ytRating?: string };
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
  };
  status: { embeddable: boolean; privacyStatus: string; uploadStatus?: string; containsSyntheticMedia?: boolean };
  statistics?: { viewCount?: string; likeCount?: string };
};

// Missing metadata remains undefined; neither adapter invents approval evidence.
export type VideoCandidate = {
  id: string; title: string; description?: string; channelId: string; creator: string;
  thumbnail?: string; durationSeconds?: number; language?: string; views?: number; likes?: number;
  embeddable?: boolean; availability?: string; processed?: boolean; syntheticDisclosure?: boolean;
  live?: boolean; ageRestricted?: boolean; regionRestricted?: boolean; captioned?: boolean;
  hd?: boolean; musicCategory?: boolean;
};
export function youtubeApiCandidate(video: YouTubeVideo): VideoCandidate {
  const { snippet: s, contentDetails: d, status, statistics } = video;
  return {
    id: video.id, title: s.title, description: s.description, channelId: s.channelId, creator: s.channelTitle,
    thumbnail: s.thumbnails?.high?.url || s.thumbnails?.medium?.url,
    durationSeconds: videoDurationSeconds(d.duration), language: s.defaultAudioLanguage || s.defaultLanguage,
    views: statistics?.viewCount === undefined ? undefined : Number(statistics.viewCount),
    likes: statistics?.likeCount === undefined ? undefined : Number(statistics.likeCount),
    embeddable: status.embeddable, availability: status.privacyStatus,
    processed: status.uploadStatus === undefined ? undefined : status.uploadStatus === "processed",
    syntheticDisclosure: status.containsSyntheticMedia,
    live: s.liveBroadcastContent === undefined ? undefined : s.liveBroadcastContent !== "none",
    ageRestricted: d.contentRating?.ytRating === "ytAgeRestricted",
    regionRestricted: d.regionRestriction?.allowed !== undefined || (d.regionRestriction?.blocked?.length ?? 0) > 0,
    captioned: d.caption === undefined ? undefined : d.caption === "true",
    hd: d.definition === undefined ? undefined : d.definition === "hd", musicCategory: s.categoryId === "10",
  };
}

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const stopWords = new Set("a an the of in on and or to for de del la las el los un una y en por para".split(" "));
const teaching = /\b(explain\w*|documentar\w*|lesson (?:on|about)|lecture\w*|tutorial\w*|education\w*|learn\w*|science|scientific|history|biology|anatomy|how\s+\w+\s+works|what\s+is|why|explica\w*|leccion (?:sobre|de)|aprend\w*|ciencia|historia|biologia|anatomia|como\s+funciona|que\s+es|por\s+que)\b/;
const spam = /\b(isn t as innocent|experts debating|disturbing painting|shorts|prank\w*|clickbait|you won t believe|shocking truth|gone wrong|iceberg chart|no one can explain|(?:science|art historians|experts) (?:still )?(?:cannot|can t) explain|ciencia no puede explicar|broma\w*|no lo creeras)\b/;
const synthetic = /\b(ai generated|ai animation|ai shorts|made with ai|created with ai|generad[oa]s? (?:con|por) ia|cread[oa]s? (?:con|por) ia|aigenerated)\b/;
const musicPerformance = /\b(acoustic cover|official (?:music|video)|music video|full song|guitar lesson|piano tutorial|lyrics?|karaoke|cover song|video musical|cancion completa|letra|videoclip)\b/;
const musicSubject = /\b(music\w*|musica\w*|song|cancion|guitar\w*|guitarra|piano|singing|canto|karaoke)\b/;
const entertainment = /\b(gameplay|minecraft|roblox|fortnite|trailer|full movie|short film|pelicula completa|cortometraje|resumen completo|movie recap|toy review|unboxing)\b/;
const cooking = /\b(recipe|recipes|how to cook|como (?:cocer|cocinar|preparar)|receta\w*)\b/;
const cookingSubject = /\b(cooking|cookery|recipe|cocina|receta\w*|baking|reposteria)\b/;

export function videoDurationSeconds(duration: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(duration);
  return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}

export function learningVideoQuery(topic: TopicCandidate, locale: Locale, documentary = false): string {
  const subject = (topic.query || topic.label).replace(/["|]/g, " ").trim();
  const intent = documentary ? (locale === "es" ? "documental" : "documentary") : (locale === "es" ? "qué es" : "explained");
  return `${subject} ${intent}`;
}

function mentionsSubject(text: string, subject: string): boolean {
  const terms = normalize(subject).split(" ").filter(term => term && !stopWords.has(term));
  const words = new Set(text.split(" "));
  return terms.length > 0 && terms.every(term => words.has(term) || words.has(`${term}s`) || words.has(`${term}es`) ||
    (term === "musica" && /\bmusical(?:es)?\b/.test(text)));
}

function rankCandidates(videos: VideoCandidate[], topic: TopicCandidate, locale: Locale, preliminary = false, searchOnly = false) {
  const subjects = [...new Set([topic.query, topic.label, topic.wikiTitle, topic.englishQuery].filter((value): value is string => !!value))];
  if (subjects.some(subject => /^(space|outer space|espacio|espacio exterior)$/i.test(subject))) subjects.push("universe", "universo", "cosmos", "astronomia", "astronomy", "galaxies", "galaxias", "solar system", "sistema solar");
  const subjectText = normalize(subjects.join(" "));
  const seen = new Set<string>();
  const ranked = videos.flatMap((video, index) => {
    if (!video.id || seen.has(video.id)) return [];
    seen.add(video.id);
    const seconds = video.durationSeconds;
    if (video.processed === false || video.syntheticDisclosure || video.live || video.ageRestricted || video.regionRestricted ||
      (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 90 || seconds > 5400))) return [];
    if (!preliminary && !searchOnly && (video.embeddable !== true || video.availability !== "public" || seconds === undefined)) return [];
    if ((preliminary || searchOnly) && (video.embeddable === false || (video.availability !== undefined && video.availability !== "public"))) return [];
    if (searchOnly && seconds === undefined) return [];

    const title = normalize(video.title);
    const establishedEducator = learningChannels.has(video.channelId);
    // Only the opening description counts; long SEO keyword lists should not establish relevance.
    const description = normalize((video.description || "").slice(0, 600));
    const titleMatch = subjects.some(subject => mentionsSubject(title, subject));
    const descriptionMatch = subjects.some(subject => mentionsSubject(normalize((video.description || "").slice(0, 240)), subject));
    if ((!titleMatch && !(establishedEducator && descriptionMatch)) || spam.test(title) || synthetic.test(`${title} ${normalize((video.description || "").slice(0, 10_000))}`)) return [];
    // "Love" as an incidental verb (e.g. bees love hexagons) is not the concept of love.
    if (subjects.every(subject => /^(love|amor)$/.test(normalize(subject))) &&
      !/\b(love|amor)\b$|\b(?:of|is|about|in|romantic|understanding|to|el|del|sobre|que es) (?:the )?(?:love|amor)\b|\b(?:love|amor) (?:is|explained|science|documentary|explicado|romantico|humano)\b/.test(title)) return [];
    if ((musicPerformance.test(title) || video.musicCategory) && !musicSubject.test(subjectText)) return [];
    if (cooking.test(title) && !cookingSubject.test(subjectText)) return [];
    // A game's name or a film format must be the selected subject, not a homonym in the result.
    const entertainmentMatches = title.match(new RegExp(entertainment.source, "g")) || [];
    if (entertainmentMatches.some(match => !subjectText.includes(match))) return [];
    const teachesInTitle = teaching.test(title);
    const teachesInDescription = teaching.test(description);
    if (!teachesInTitle && !teachesInDescription && !(searchOnly && establishedEducator && titleMatch)) return [];
    if (!preliminary && !searchOnly && !establishedEducator && (!teachesInTitle || video.captioned !== true)) return [];
    if (searchOnly && !establishedEducator && (!teachesInTitle || spam.test(description))) return [];

    const language = video.language;
    const views = video.views ?? 0;
    const likes = video.likes ?? 0;
    // Unknown channels need additional evidence. Engagement is a confidence signal,
    // not proof of accuracy or a reliable detector of undisclosed synthetic content.
    if (!preliminary && !establishedEducator && (!Number.isFinite(views) || views < 1000 ||
      (!searchOnly && (!Number.isFinite(likes) || likes < 10 || likes / views < 0.005)))) return [];
    // Established sources, topic and learning signals dominate; popularity is a bounded tie-breaker.
    const score = (establishedEducator ? 50 : 0) + (titleMatch ? 40 : 20) + (teachesInTitle ? 25 : 12) +
      (seconds !== undefined && seconds >= 180 && seconds <= 1800 ? 6 : 0) + (video.hd === true ? 4 : 0) +
      (video.captioned === true ? 3 : 0) + (language?.split("-")[0] === locale ? 6 : 0) +
      Math.min(3, Math.log10(Math.max(1, views)) / 2) +
      (views >= 1000 && likes / views >= 0.01 ? 2 : 0);
    return [{ video, score, index }];
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  return ranked;
}

function diverse(videos: VideoCandidate[], limit: number): VideoCandidate[] {
  if (limit <= 0) return [];
  const selected: VideoCandidate[] = [];
  const channels = new Set<string>();
  for (const video of videos) {
    const channel = video.channelId || video.creator;
    if (channels.has(channel)) continue;
    selected.push(video); channels.add(channel);
    if (selected.length === limit) return selected;
  }
  for (const video of videos) {
    if (!selected.some(item => item.id === video.id)) selected.push(video);
    if (selected.length === limit) break;
  }
  return selected;
}
export function shortlistLearningVideos(videos: VideoCandidate[], topic: TopicCandidate, locale: Locale): VideoCandidate[] {
  return diverse(rankCandidates(videos, topic, locale, true).map(entry => entry.video), 6);
}
export function selectLearningCandidates(videos: VideoCandidate[], topic: TopicCandidate, locale: Locale): VideoCandidate[] {
  return diverse(rankCandidates(videos, topic, locale).map(entry => entry.video), 3);
}
/** Rank public search listings without requiring fields only watch-page extraction provides. */
export function selectSearchLearningCandidates(videos: VideoCandidate[], topic: TopicCandidate, locale: Locale): VideoCandidate[] {
  const ranked = rankCandidates(videos, topic, locale, false, true).map(entry => entry.video);
  const educators = diverse(ranked.filter(video => learningChannels.has(video.channelId)), 3);
  // Channel diversity must not promote a weaker unknown source over a useful
  // second lesson from an established educator.
  return [...educators, ...diverse(ranked.filter(video => !learningChannels.has(video.channelId)), 3 - educators.length)].slice(0, 3);
}
// Compatibility helper for callers holding the Data API's wire format.
export function selectLearningVideos(videos: YouTubeVideo[], topic: TopicCandidate, locale: Locale): YouTubeVideo[] {
  const byId = new Map(videos.map(video => [video.id, video]));
  return selectLearningCandidates(videos.map(youtubeApiCandidate), topic, locale).map(video => byId.get(video.id)!);
}

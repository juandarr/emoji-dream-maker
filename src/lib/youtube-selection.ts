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

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const stopWords = new Set("a an the of in on and or to for de del la las el los un una y en por para".split(" "));
const teaching = /\b(explain\w*|documentar\w*|lesson (?:on|about)|lecture\w*|tutorial\w*|education\w*|learn\w*|science|scientific|history|biology|anatomy|how\s+\w+\s+works|what\s+is|why|explica\w*|leccion (?:sobre|de)|aprend\w*|ciencia|historia|biologia|anatomia|como\s+funciona|que\s+es|por\s+que)\b/;
const spam = /\b(shorts|prank\w*|clickbait|you won t believe|shocking truth|gone wrong|iceberg chart|no one can explain|science (?:cannot|can t) explain|ciencia no puede explicar|broma\w*|no lo creeras)\b/;
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
  const intent = documentary ? (locale === "es" ? "documental" : "documentary") : (locale === "es" ? "explicacion" : "explained");
  return `${subject} ${intent}`;
}

function mentionsSubject(text: string, subject: string): boolean {
  const terms = normalize(subject).split(" ").filter(term => term && !stopWords.has(term));
  const words = new Set(text.split(" "));
  return terms.length > 0 && terms.every(term => words.has(term) || words.has(`${term}s`) || words.has(`${term}es`));
}

export function selectLearningVideos(videos: YouTubeVideo[], topic: TopicCandidate, locale: Locale): YouTubeVideo[] {
  const subjects = [...new Set([topic.query, topic.label, topic.wikiTitle, topic.englishQuery].filter((value): value is string => !!value))];
  const subjectText = normalize(subjects.join(" "));
  const seen = new Set<string>();
  const ranked = videos.flatMap((video, index) => {
    if (!video.id || seen.has(video.id)) return [];
    seen.add(video.id);
    const { snippet, contentDetails: details, status } = video;
    const seconds = videoDurationSeconds(details.duration);
    // Metadata checks are conservative: never pad the list with failed candidates.
    if (!status.embeddable || status.privacyStatus !== "public" ||
      (status.uploadStatus && status.uploadStatus !== "processed") || status.containsSyntheticMedia ||
      (snippet.liveBroadcastContent && snippet.liveBroadcastContent !== "none") ||
      seconds < 90 || seconds > 5400 || details.contentRating?.ytRating === "ytAgeRestricted" ||
      details.regionRestriction?.allowed !== undefined || (details.regionRestriction?.blocked?.length ?? 0) > 0) return [];

    const title = normalize(snippet.title);
    const establishedEducator = learningChannels.has(snippet.channelId);
    // Only the opening description counts; long SEO keyword lists should not establish relevance.
    const description = normalize((snippet.description || "").slice(0, 600));
    const titleMatch = subjects.some(subject => mentionsSubject(title, subject));
    const descriptionMatch = subjects.some(subject => mentionsSubject(normalize((snippet.description || "").slice(0, 240)), subject));
    if ((!titleMatch && !(establishedEducator && descriptionMatch)) || spam.test(title) || synthetic.test(`${title} ${description}`)) return [];
    // "Love" as an incidental verb (e.g. bees love hexagons) is not the concept of love.
    if (subjects.every(subject => /^(love|amor)$/.test(normalize(subject))) &&
      !/\b(love|amor)\b$|\b(?:of|is|about|in|romantic|understanding|to|el|del|sobre|que es) (?:the )?(?:love|amor)\b|\b(?:love|amor) (?:is|explained|science|documentary|explicado|romantico|humano)\b/.test(title)) return [];
    if ((musicPerformance.test(title) || snippet.categoryId === "10") && !musicSubject.test(subjectText)) return [];
    if (cooking.test(title) && !cookingSubject.test(subjectText)) return [];
    // A game's name or a film format must be the selected subject, not a homonym in the result.
    const entertainmentMatches = title.match(new RegExp(entertainment.source, "g")) || [];
    if (entertainmentMatches.some(match => !subjectText.includes(match))) return [];
    const teachesInTitle = teaching.test(title);
    const teachesInDescription = teaching.test(description);
    if (!teachesInTitle && !teachesInDescription) return [];
    if (!establishedEducator && (!teachesInTitle || details.caption !== "true")) return [];

    const language = snippet.defaultAudioLanguage || snippet.defaultLanguage;
    const views = Number(video.statistics?.viewCount || 0);
    const likes = Number(video.statistics?.likeCount || 0);
    // Unknown channels need additional evidence. Engagement is a confidence signal,
    // not proof of accuracy or a reliable detector of undisclosed synthetic content.
    if (!establishedEducator && (!Number.isFinite(views) || !Number.isFinite(likes) || views < 1000 || likes < 10 || likes / views < 0.005)) return [];
    // Established sources, topic and learning signals dominate; popularity is a bounded tie-breaker.
    const score = (establishedEducator ? 50 : 0) + (titleMatch ? 40 : 20) + (teachesInTitle ? 25 : 12) +
      (seconds >= 180 && seconds <= 1800 ? 6 : 0) + (details.definition === "hd" ? 4 : 0) +
      (details.caption === "true" ? 3 : 0) + (language?.split("-")[0] === locale ? 6 : 0) +
      Math.min(3, Math.log10(Math.max(1, views)) / 2) +
      (views >= 1000 && likes / views >= 0.01 ? 2 : 0);
    return [{ video, score, index }];
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  // Prefer different teachers/perspectives, then fill from qualifying repeat channels.
  const selected: YouTubeVideo[] = [];
  const channels = new Set<string>();
  for (const { video } of ranked) {
    const channel = video.snippet.channelId || video.snippet.channelTitle;
    if (channels.has(channel)) continue;
    selected.push(video); channels.add(channel);
    if (selected.length === 3) return selected;
  }
  for (const { video } of ranked) {
    if (!selected.some(item => item.id === video.id)) selected.push(video);
    if (selected.length === 3) break;
  }
  return selected;
}

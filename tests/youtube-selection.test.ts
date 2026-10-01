import { describe, expect, it } from "vitest";
import { learningVideoQuery, selectSearchLearningCandidates, youtubeApiCandidate, selectLearningVideos, videoDurationSeconds } from "@/lib/youtube-selection";
import type { YouTubeVideo } from "@/lib/youtube-selection";

const topic = { label: "Octopus", query: "Octopus", englishQuery: "Octopus", language: "en" as const };
function video(id: string, title = "Octopus biology explained", channelId = id): YouTubeVideo {
  return { id, snippet: { title, channelId, channelTitle: channelId, description: "Learn about octopus intelligence and life in the ocean.", liveBroadcastContent: "none" },
    statistics: { viewCount: "10000", likeCount: "200" }, contentDetails: { duration: "PT8M", definition: "hd", caption: "true" }, status: { embeddable: true, privacyStatus: "public", uploadStatus: "processed" } };
}
const select = (videos: YouTubeVideo[]) => selectLearningVideos(videos, topic, "en").map(item => item.id);
describe("educational video selection", () => {
  it("selects three relevant lessons ahead of viral spam, synthetic videos and unrelated matches", () => {
    const unrelated = video("wrong", "Lemon chemistry explained"); unrelated.snippet.description = "Learn about lemons.";
    const synthetic = video("synthetic"); synthetic.status.containsSyntheticMedia = true;
    expect(select([video("spam", "Octopus shocking truth!"), video("ai", "Octopus AI generated documentary"), unrelated, synthetic,
      video("one"), video("two", "Octopus documentary"), video("three", "Octopus anatomy explained")])).toEqual(["one", "two", "three"]);
  });
  it("rejects vague mystery titles and unknown sources without captions", () => {
    const vague = video("vague", "Octopus: the mystery of supreme ocean intelligence");
    const noCaptions = video("no-captions"); noCaptions.contentDetails.caption = "false";
    expect(select([vague, noCaptions])).toEqual([]);
  });
  it("requires real subject words and learning intent, rather than substring matches or SEO tags", () => {
    const substring = video("substring", "Octopussy explained"); substring.snippet.description = "A lesson about the film.";
    const noIntent = video("no-intent", "Octopus compilation"); noIntent.snippet.description = "Eight arms in action.";
    const stuffed = video("stuffed", "Unrelated lecture"); stuffed.snippet.description = "Lemons. ".repeat(100) + "Octopus biology";
    expect(select([substring, noIntent, stuffed])).toEqual([]);
  });
  it("rejects shorts, livestreams, non-embeddable, private, restricted and invalid-duration videos", () => {
    const candidates = [video("short"), video("live"), video("embed"), video("private"), video("age"), video("region"), video("invalid"), video("long")];
    candidates[0].contentDetails.duration = "PT45S"; candidates[1].snippet.liveBroadcastContent = "upcoming";
    candidates[2].status.embeddable = false; candidates[3].status.privacyStatus = "private";
    candidates[4].contentDetails.contentRating = { ytRating: "ytAgeRestricted" };
    candidates[5].contentDetails.regionRestriction = { allowed: [] };
    candidates[6].contentDetails.duration = "invalid"; candidates[7].contentDetails.duration = "PT2H";
    expect(select(candidates)).toEqual([]);
  });
  it("requires the subject in the title even when an unrelated video is popular", () => {
    const popular = video("popular", "Marine biology explained"); popular.statistics = { viewCount: "100000000", likeCount: "10000000" };
    expect(select([popular, video("specific")])).toEqual(["specific"]);
  });
  it("deduplicates videos and prefers three different channels", () => {
    expect(select([video("one", undefined, "teacher"), video("one"), video("two", undefined, "teacher"), video("three"), video("four")])).toEqual(["one", "three", "four"]);
    expect(select([video("one", undefined, "teacher"), video("two", undefined, "teacher"), video("three", undefined, "teacher")])).toEqual(["one", "two", "three"]);
  });
  it("returns fewer than three instead of filling with unsuitable videos", () => {
    expect(select([video("good"), video("bad", "Octopus prank")])).toEqual(["good"]);
  });
  it("screens sensational expert-mystery titles and AI disclosures beyond the opening description", () => {
    const disclosed = video("disclosed"); disclosed.snippet.description += " Context.".repeat(100) + " Created with AI.";
    expect(select([disclosed])).toEqual([]);
    const painting = { ...topic, label: "Painting", query: "Painting", englishQuery: "Painting" };
    expect(selectLearningVideos([video("mystery", "Art Historians Still Can't Explain This Painting")], painting, "en")).toEqual([]);
  });
  it("supports Spanish accents, full compound subjects and English article equivalents", () => {
    const spanish = { label: "Nota musical", query: "Nota musical", englishQuery: "Musical note", language: "es" as const };
    const note = video("note", "¿Qué es una nota musical? Explicación"); note.snippet.defaultAudioLanguage = "es";
    const music = video("wrong", "La música explicada"); music.snippet.description = "Historia de la música.";
    const english = video("en", "Musical note explained");
    expect(selectLearningVideos([music, english, note], spanish, "es").map(item => item.id)).toEqual(["note", "en"]);
    expect(learningVideoQuery(spanish, "es").split("|").every(branch => branch.includes("Nota musical"))).toBe(true);
  });
  it("rejects song and film homonyms while preserving teaching about music", () => {
    const song = video("song", "Octopus's Garden Guitar Lesson (Full Song) - The Beatles"); song.snippet.categoryId = "10";
    const game = video("game", "Octopus Minecraft tutorial");
    const recipe = video("recipe", "Como cocer Pulpo explicado paso a paso");
    const fakeMystery = video("fake", "El Pulpo: Una Inteligencia que la Ciencia No Puede Explicar");
    expect(select([song, game, recipe, fakeMystery, video("biology")])).toEqual(["biology"]);
    const love = { ...topic, query: "Love", label: "Love", englishQuery: "Love" };
    const story = video("story", "The Lesson of Love"); story.snippet.description = "The lesson of love, a story.";
    expect(selectLearningVideos([story, video("cover", "How Deep Is Your Love - Acoustic Cover Tutorial"), video("verb", "Why do honeybees love hexagons?"), video("sleep", "Sleep Is Your Superpower")], love, "en")).toEqual([]);
    const guitar = { ...topic, label: "Guitar", query: "Guitar", englishQuery: "Guitar" };
    const lesson = video("guitar", "Guitar tutorial for beginners"); lesson.snippet.categoryId = "10";
    expect(selectLearningVideos([lesson], guitar, "en").map(item => item.id)).toEqual(["guitar"]);
  });
  it("prefers established educators by ID and requires confidence evidence for unknown channels", () => {
    const educator = video("educator", "Octopus intelligence explained", "UCsooa4yRKGN_zEE8iknghZA");
    const popular = video("viral"); popular.snippet.channelTitle = "TED-Ed";
    popular.statistics = { viewCount: "100000000", likeCount: "10000000" };
    const unknown = video("unknown"); unknown.statistics = { viewCount: "20", likeCount: "1" };
    educator.statistics = undefined;
    expect(select([popular, unknown, educator])).toEqual(["educator", "viral"]);
  });
  it("keeps three established lessons ahead of weaker channels just to vary creators", () => {
    const videos = [video("one", undefined, "UCsooa4yRKGN_zEE8iknghZA"), video("two", undefined, "UCsooa4yRKGN_zEE8iknghZA"),
      video("three", undefined, "UCsooa4yRKGN_zEE8iknghZA"), video("unknown")].map(youtubeApiCandidate);
    expect(selectSearchLearningCandidates(videos, topic, "en").map(item => item.id)).toEqual(["one", "two", "three"]);
  });
  it("parses hours, minutes, seconds and invalid durations", () => {
    expect(videoDurationSeconds("PT1H2M3S")).toBe(3723); expect(videoDurationSeconds("PT90S")).toBe(90);
    expect(videoDurationSeconds("P1D")).toBe(0);
  });
});

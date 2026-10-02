import { describe, expect, it } from "vitest";
import { soundSearchPlan } from "@/lib/sound-associations";
import { selectSounds } from "@/lib/sound-selection";
import type { SoundCandidate } from "@/lib/sound-selection";
import type { TopicCandidate } from "@/lib/types";

const topic = (englishQuery: string): TopicCandidate => ({ label: englishQuery, query: englishQuery, englishQuery, language: "en" });
const sound = (id: number, name: string, extra: Partial<SoundCandidate> = {}): SoundCandidate => ({
  id, name, url: `https://freesound.org/s/${id}/`, username: `creator-${id}`, license: "https://creativecommons.org/publicdomain/zero/1.0/",
  previews: { "preview-hq-mp3": `https://cdn.freesound.org/${id}.mp3` }, duration: 12, ...extra,
});

describe("sound interpretations", () => {
  it("translates article titles into audible scenes and marks abstract associations", () => {
    expect(soundSearchPlan(topic("Ocean")).cues.map(c => c.query)).toEqual(["ocean waves", "underwater ambience"]);
    expect(soundSearchPlan(topic("Thought")).cues.every(c => c.connection === "evocative")).toBe(true);
    expect(soundSearchPlan(topic("Magic (supernatural)")).cues[0].query).toBe("magic chimes");
    expect(soundSearchPlan(topic("Planetary ring")).cues[0].connection).toBe("evocative");
  });
  it("honors a changed subject and keeps English retrieval with Spanish labels", () => {
    expect(soundSearchPlan(topic("Love")).cues.map(c => c.query)).not.toContain("heartbeat");
    const heart = { ...topic("Human heart"), label: "Corazón humano", query: "Corazón humano", language: "es" as const };
    expect(soundSearchPlan(heart).cues.map(c => c.query)).toEqual(["heartbeat"]);
    expect(selectSounds([sound(1, "Heartbeat recording")], heart, "es")[0].soundConnection).toEqual({ label: "latido del corazón", kind: "direct" });
  });
  it("uses a precise fallback and does not invent cultural sounds for country flags", () => {
    expect(soundSearchPlan(topic("Glass harmonica")).cues[0].query).toBe("glass harmonica");
    expect(soundSearchPlan(topic("Flag of Colombia")).cues[0].query).toBe("flag flapping");
    expect(selectSounds([sound(1, "Guitar music")], topic("Glass harmonica"), "en")).toEqual([]);
  });
});

describe("sound relevance and quality", () => {
  it("rejects incidental titles and synth homonyms even with high popularity", () => {
    const results = selectSounds([
      sound(1, "Ocean of love remix", { tags: ["ocean", "waves"], num_downloads: 999999 }),
      sound(2, "Ocean sine-wave synth", { tags: ["ocean", "waves"] }),
      sound(3, "Ocean waves at the beach", { tags: ["ocean", "waves"] }),
      sound(4, "Kitchen drawer"),
    ], topic("Ocean"), "en");
    expect(results.map(s => s.id)).toEqual(["3"]);
    expect(results[0].soundConnection?.label).toBe("ocean waves");
  });
  it("ranks title and tag evidence above description mentions and popularity", () => {
    const results = selectSounds([
      sound(1, "Recording 01", { description: "A field recording of waves breaking on the ocean shore.", num_downloads: 999999, avg_rating: 5, num_ratings: 100 }),
      sound(2, "Sea waves", { tags: ["waves", "sea"] }),
      sound(3, "Ocean sounds", { description: "I love the ocean, music and waves. Here is a keyboard." }),
    ], topic("Ocean"), "en");
    expect(results.map(s => s.id)).toEqual(["2", "1"]);
  });
  it("matches full words and excludes unsupported duration, previews and rights", () => {
    const results = selectSounds([
      sound(1, "Bellows"), sound(2, "Bell", { duration: 0 }), sound(3, "Bell", { duration: 200 }),
      sound(4, "Bell", { previews: {} }), sound(5, "Bell", { username: "" }),
      sound(6, "Bell", { license: "https://creativecommons.org/licenses/by-nc/4.0/" }),
      sound(7, "Bell", { license: "https://example.com/licenses/by/4.0/" }),
      sound(8, "Bell", { previews: { "preview-hq-mp3": "http://example.com/bell.mp3" } }),
      sound(9, "Church bell", { license: "http://creativecommons.org/licenses/by/4.0/" }),
    ], topic("Bell"), "en");
    expect(results.map(s => s.id)).toEqual(["9"]);
    expect(results[0].license).toBe("CC BY");
    expect(results[0].licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
  });
  it("uses an HQ Ogg preview when an HQ MP3 is unavailable", () => {
    const result = selectSounds([sound(1, "Bell", { previews: { "preview-hq-ogg": "https://cdn.freesound.org/bell.ogg" } })], topic("Bell"), "en");
    expect(result[0].previewUrl).toMatch(/\.ogg$/);
  });
  it("deduplicates IDs, identical audio and numbered variations while diversifying scenes", () => {
    const results = selectSounds([
      sound(1, "Ocean waves 01.wav", { username: "same", pack: "pack-a", md5: "same-audio" }),
      sound(1, "Ocean waves 01.wav", { username: "same", pack: "pack-a" }),
      sound(2, "Ocean waves 02.wav", { username: "same", pack: "pack-a" }),
      sound(3, "Sea waves", { md5: "same-audio" }),
      sound(4, "Underwater hydrophone recording"),
      sound(5, "Beach waves"),
    ], topic("Ocean"), "en");
    expect(results.map(s => s.id)).toEqual(["1", "4", "5"]);
  });
  it("uses ratings only within the relevance tier and keeps unrated recordings eligible", () => {
    const results = selectSounds([
      sound(1, "Bell", { avg_rating: 3, num_ratings: 3 }),
      sound(2, "Bells", { avg_rating: 5, num_ratings: 10 }), sound(3, "Bell ringing"),
    ], topic("Bell"), "en");
    expect(results.map(s => s.id)).toEqual(["2", "1", "3"]);
  });
  it("returns empty rather than filling abstract subjects with unrelated music", () => {
    expect(selectSounds([sound(1, "Love song remix"), sound(2, "Bass loop")], topic("Love"), "en")).toEqual([]);
    const result = selectSounds([sound(3, "Romantic piano melody")], topic("Love"), "en");
    expect(result[0].soundConnection?.kind).toBe("evocative");
  });
  it("keeps disambiguation when a user switches to a homonym", () => {
    expect(soundSearchPlan(topic("Mouse (computing)")).cues[0].query).toBe("mouse click");
    expect(soundSearchPlan(topic("Bass (fish)")).cues[0].query).toBe("bass fish");
    expect(selectSounds([sound(1, "Acoustic bass notes")], topic("Bass (fish)"), "en")).toEqual([]);
  });
  it("excludes misleading scenes found during the live sound review", () => {
    expect(selectSounds([sound(1, "Paper bag rustling")], topic("Book"), "en")).toEqual([]);
    expect(selectSounds([sound(1, "Whale singing effect", { tags: ["whale", "song", "synthesizer"] })], topic("Whale"), "en")).toEqual([]);
    expect(selectSounds([sound(1, "Whale Song LFO's.wav")], topic("Whale"), "en")).toEqual([]);
    expect(selectSounds([sound(1, "Totally Unique", { tags: ["whale-song"], description: "The sound of a bulldog snoring, manipulated to sound something like a whale song." })], topic("Whale"), "en")).toEqual([]);
    expect(selectSounds([sound(1, "Evil human laughter")], topic("Laughter"), "en")).toEqual([]);
    expect(selectSounds([sound(1, "Wing Flap (Flag Flapping)")], topic("Flag of Colombia"), "en")).toEqual([]);
    expect(selectSounds([sound(1, "Bar Ambience Night Busy")], topic("Sleep"), "en")).toEqual([]);
    const page = selectSounds([sound(1, "Page Turn"), sound(2, "Book pages rustling")], topic("Book"), "en");
    expect(page).toHaveLength(2);
  });
});

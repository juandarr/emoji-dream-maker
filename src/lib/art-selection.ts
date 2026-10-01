import { artExclusionsByQuery } from "./aliases";
import type { MediaItem, TopicCandidate } from "./types";

// Visual associations expand the selected concept, not arbitrary emoji tags.
// These also apply to translated English queries and to changed subjects.
const associations: Record<string, string[]> = {
  love: ["love", "lovers", "cupid", "embrace", "kiss"],
  "heart symbol": ["heart", "love", "cupid"], heartbreak: ["heartbreak", "sorrow", "parting"],
  smile: ["smile", "smiling", "laughter"], laughter: ["laughter", "laughing", "joy"],
  sadness: ["sadness", "sorrow", "weeping", "melancholy"], anger: ["anger", "wrath", "rage"],
  fear: ["fear", "fright", "terror"], thought: ["thought", "contemplation", "meditation"],
  sleep: ["sleep", "sleeping", "dream"], magic: ["magic", "magician", "sorcery"], anxiety: ["anxiety", "anguish", "worry"],
  surprise: ["surprise", "astonishment"], relief: ["relief", "repose"],
  celebration: ["celebration", "festival", "feast"], hug: ["embrace", "hug"],
  peace: ["peace", "dove"], prayer: ["prayer", "praying"], meditation: ["meditation", "contemplation"],
  "musical note": ["music", "musician", "instrument", "lute", "violin", "piano"],
  "musical keyboard": ["piano", "keyboard", "harpsichord"], music: ["music", "musician", "instrument"],
  ocean: ["sea", "ocean", "seascape", "wave"], wave: ["wave", "sea", "seascape"],
  crescent: ["moon", "moonlight", "crescent moon", "moonlit"], moon: ["moon", "moonlight", "lunar", "moonlit"],
  "planetary ring": ["planet", "astronomy", "solar system"], "milky way": ["milky way", "starry sky", "night sky"],
  "cherry blossom": ["cherry blossom", "flowering cherry"],
  octopus: ["octopus", "octopi", "octopuses"], octopoda: ["octopus", "octopi"],
  dog: ["dog", "puppy", "hound"], cat: ["cat", "kitten"], cattle: ["cattle", "cow", "bull"],
  horse: ["horse", "equestrian"], rabbit: ["rabbit", "hare"], "giant panda": ["panda"],
  mouse: ["mouse", "mice"], fox: ["fox", "foxes"], dance: ["dance", "dancer", "dancing"],
  running: ["running", "runner"], swimming: ["swimming", "swimmer"],
  "association football": ["football", "soccer"], "performing arts": ["theater", "theatre", "stage"],
  "desert island": ["island", "tropical island"], "incandescent light bulb": ["light bulb", "lamp"],
  "classical architecture": ["classical architecture", "temple", "column"],
  "human heart": ["human heart", "anatomical heart"], "heart": ["human heart", "anatomical heart"], "human brain": ["brain", "anatomy of the brain"], brain: ["brain", "anatomy of the brain"],
};
const clean = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function artSearchPlan(topic: TopicCandidate) {
  const subject = clean(topic.englishQuery.replace(/\s*\((?:emotion|activity|supernatural|symbol|lighting)\)/gi, ""));
  const terms = associations[subject] || [subject];
  return { subject, terms, queries: terms.slice(0, 3), generalPainting: subject === "painting" || subject === "fine art" || subject === "art" };
}
function contains(text: string, term: string) {
  const normalized = ` ${clean(text)} `;
  // A bounded plural variant, not substring matching (cat must not match cathedral).
  return normalized.includes(` ${term} `) || normalized.includes(` ${term}s `);
}
export type ArtCandidate = MediaItem & { subjects?: string[]; description?: string; series?: string };
export function rankArt(candidates: ArtCandidate[], topic: TopicCandidate): MediaItem[] {
  const plan = artSearchPlan(topic);
  const ranked = candidates.flatMap(item => {
    // Homonyms that previously produced visibly incorrect discoveries.
    if ((artExclusionsByQuery[plan.subject] || []).includes(item.title)) return [];
    if (plan.subject === "fox" && /fox river/i.test(item.title)) return [];
    const painting = /paintings?|oil on|watercolou?r|ink.*(?:silk|paper)/i.test(item.kind || "");
    let score = 0, matchedTerm = "";
    for (const [index, term] of plan.terms.entries()) {
      const titleMatch = contains(item.title, term);
      const subjectMatch = (item.subjects || []).some(subject => contains(subject, term));
      const preciseAnatomy = /^(human heart|heart|brain|human brain)$/.test(plan.subject);
      const descriptionMatch = !preciseAnatomy && (item.description || "").slice(0, 1800).split(/[.!?]/).some(sentence =>
        contains(sentence, term) && /depict|represent|illustrat|portray|painted|carved|engraved|motif|features?|shows?|scene|design|decorat/i.test(sentence));
      const value = (titleMatch ? 100 : subjectMatch ? 78 : descriptionMatch ? 40 : 0) - index * 2;
      if (value > score) { score = value; matchedTerm = term; }
    }
    if (plan.generalPainting && painting) { score = 80; matchedTerm = "painting"; }
    if (!score || !item.previewUrl || !item.imageUrl) return [];
    // Paintings are preferred within a relevance tier; weak matches cannot outrank direct ones.
    return [{ item: { ...item, matchedTerm }, score: score + (painting ? 12 : 0) }];
  }).sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const seen = new Set<string>(), output: MediaItem[] = [], creators = new Map<string, number>(), series = new Map<string, number>();
  const seriesKey = (item: ArtCandidate) => clean(item.series || item.title.match(/,?\s+from (?:an? |the )?([^(:]+)/i)?.[1] || "");
  while (ranked.length && output.length < 5) {
    // Repeated artists, series, and collections receive a modest diversity penalty.
    // All candidates have already passed relevance; empty space is never padded.
    const priority = ({ item, score }: typeof ranked[number]) => score - Math.min(30,
      (creators.get(clean(item.creator || "")) || 0) * 14
      + (series.get(seriesKey(item)) || 0) * 28
      + output.filter(existing => existing.collection && existing.collection === item.collection).length * 3);
    ranked.sort((a, b) => priority(b) - priority(a) || a.item.id.localeCompare(b.item.id));
    const { item } = ranked.shift()!;
    const key = `${clean(item.title)}:${clean(item.creator || "")}:${clean(item.date || "")}`;
    if (seen.has(key) || output.some(existing => existing.id === item.id || existing.imageUrl === item.imageUrl)) continue;
    seen.add(key);
    const artist = clean(item.creator || ""), seriesName = seriesKey(item);
    if (artist) creators.set(artist, (creators.get(artist) || 0) + 1);
    if (seriesName) series.set(seriesName, (series.get(seriesName) || 0) + 1);
    const { subjects: _subjects, description: _description, series: _series, ...media } = item;
    output.push(media);
  }
  return output;
}

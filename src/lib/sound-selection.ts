import { normalizeSoundText, soundSearchPlan } from "./sound-associations";
import type { SoundCue } from "./sound-associations";
import type { Locale, MediaItem, TopicCandidate } from "./types";

export type SoundCandidate = {
  id: number; name: string; url: string; username: string; license: string;
  previews?: Record<string, string>; tags?: string[]; description?: string;
  duration?: number; pack?: string | null; md5?: string;
  avg_rating?: number; num_ratings?: number; num_downloads?: number;
};

const stopWords = new Set("a an the of in on and or to for with".split(" "));
const compilation = /\b(compilation|sample pack demo|sample pack preview|full album|full song|remix|mashup|lyrics|tutorial)\b/;
const artificial = /\b(synth|synthesizer|synthesiser|synthesized|synthesised|oscillator|lfo|lfos|wavetable|dubstep|techno|bass loop|drum loop)\b/;
const imitation = /\b(fake|imitation|imitated|simulated)\b|\b(made|created|manipulated|processed|designed|pitched|edited)\b.{0,100}\b(sound(?:s|ing)? (?:something )?like|resemble|imitate)\b/;
const audioContext = /\b(recorded|recording|sound|sounds|hear|heard|field recording|ambience|ambiance)\b/;

function contains(text: string, term: string) {
  const wanted = normalizeSoundText(term).split(" ").filter(word => !stopWords.has(word));
  const words = new Set(text.split(" "));
  // Match complete words (cat must not match cathedral), allowing ordinary plurals.
  return wanted.length > 0 && wanted.every(word => words.has(word) || words.has(`${word}s`) || words.has(`${word}es`));
}

function evidence(sound: SoundCandidate, cue: SoundCue) {
  const title = normalizeSoundText(sound.name);
  const tags = normalizeSoundText((sound.tags || []).slice(0, 40).join(" "));
  const description = normalizeSoundText((sound.description || "").slice(0, 360));
  if ((cue.exclude || []).some(term => contains(`${title} ${tags}`, term))) return 0;
  // Literal animal/environment searches must not turn into unrelated synth loops.
  const provenance = `${title} ${tags} ${normalizeSoundText((sound.description || "").slice(0, 1600))}`;
  if (cue.connection === "direct" && (artificial.test(provenance) || imitation.test(provenance)) &&
    !/\b(piano|guitar|music|drum|dance|violin|trumpet|saxophone)\b/.test(cue.query)) return 0;
  let score = 0;
  for (const term of cue.terms) {
    const inTitle = contains(title, term), inTags = contains(tags, term);
    const inDescription = contains(description, term) && audioContext.test(description);
    // Description-only evidence needs a specific phrase. Long tag lists and
    // incidental mentions of a single noun cannot establish the connection.
    const preciseDescription = normalizeSoundText(term).split(" ").length > 1 && inDescription;
    score = Math.max(score, inTitle ? 90 : inTags ? 70 : preciseDescription ? 48 : 0);
    if (inTitle && inTags) score = Math.max(score, 98);
  }
  return score;
}

function httpsURL(value?: string) {
  try { const url = new URL(value || ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

function rights(value: string) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "creativecommons.org") return;
    const label = /^\/publicdomain\/zero\/1\.0\/?$/.test(url.pathname) ? "CC0" : /^\/licenses\/by\/\d\.\d\/?$/.test(url.pathname) ? "CC BY" : undefined;
    if (!label) return;
    url.protocol = "https:";
    return { label, url: url.href };
  } catch { return; }
}

export function selectSounds(candidates: SoundCandidate[], topic: TopicCandidate, locale: Locale): MediaItem[] {
  const plan = soundSearchPlan(topic);
  const ranked = candidates.flatMap(sound => {
    const license = rights(sound.license);
    const sourceUrl = httpsURL(sound.url);
    const previewUrl = httpsURL(sound.previews?.["preview-hq-mp3"]) || httpsURL(sound.previews?.["preview-hq-ogg"]);
    if (!Number.isInteger(sound.id) || sound.id <= 0 || !sound.name?.trim() || !sound.username?.trim() || !license || !sourceUrl || !previewUrl ||
      !Number.isFinite(sound.duration) || sound.duration! < 0.3 || sound.duration! > 180 || compilation.test(normalizeSoundText(sound.name))) return [];
    const matches = plan.cues.map((cue, index) => ({ cue, index, evidence: evidence(sound, cue) })).filter(match => match.evidence > 0);
    matches.sort((a, b) => b.evidence - a.evidence || a.index - b.index);
    if (!matches.length) return [];
    const best = matches[0];
    // Quality is only a small tie-breaker; popularity never rescues an unrelated sound.
    const rating = Number.isFinite(sound.avg_rating) && (sound.num_ratings || 0) > 0 ? Math.min(5, Math.max(0, sound.avg_rating!)) : 0;
    const popularity = Number.isFinite(sound.num_downloads) ? Math.min(3, Math.log10(1 + Math.max(0, sound.num_downloads!))) : 0;
    return [{ sound, cue: best.cue, cueIndex: best.index, score: best.evidence + rating + popularity - best.index * 4 + (best.cue.connection === "direct" ? 2 : 0), sourceUrl, previewUrl, license }];
  });
  const selected: typeof ranked = [];
  const seenIds = new Set<number>(), seenAudio = new Set<string>(), seenNames = new Set<string>();
  while (ranked.length && selected.length < 3) {
    const priority = (candidate: typeof ranked[number]) => candidate.score
      - selected.filter(item => item.cueIndex === candidate.cueIndex).length * 12
      - selected.filter(item => item.sound.username === candidate.sound.username).length * 10
      - (candidate.sound.pack ? selected.filter(item => item.sound.pack === candidate.sound.pack).length * 20 : 0);
    ranked.sort((a, b) => priority(b) - priority(a) || a.sound.id - b.sound.id);
    const item = ranked.shift()!;
    // Numbered variations from one creator are not three different discoveries.
    const name = `${item.sound.username}:${normalizeSoundText(item.sound.name).replace(/\b\d+\b/g, "").replace(/\b(wav|mp3|ogg|flac|aiff)\b/g, "").replace(/\s+/g, " ").trim()}`;
    const audio = item.sound.md5 || item.previewUrl;
    if (seenIds.has(item.sound.id) || seenAudio.has(audio) || seenNames.has(name)) continue;
    seenIds.add(item.sound.id); seenAudio.add(audio); seenNames.add(name); selected.push(item);
  }
  return selected.map(({ sound, cue, sourceUrl, previewUrl, license }) => ({
    id: String(sound.id), title: sound.name, sourceUrl, previewUrl, creator: sound.username,
    license: license.label, licenseUrl: license.url, durationSeconds: sound.duration,
    soundConnection: { label: cue.labels[locale], kind: cue.connection },
  }));
}

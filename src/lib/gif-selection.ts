import { defaultTopic } from "./catalog";
import type { EmojiRecord, Locale, MediaItem, TopicCandidate } from "./types";

export const GIF_RESULT_LIMIT = 3;

// Narrow visual/reaction equivalents, rather than broad emoji keywords such as
// "animal" or "nature" that would admit unrelated GIFs.
const equivalents: string[][] = [
  ["octopus", "octopoda", "octopi", "octopuses", "pulpo", "pulpos"],
  ["smile", "smiling", "sonrisa", "sonriendo"],
  ["laughter", "laugh", "laughing", "risa", "riendo", "reir"],
  ["love", "loving", "amor", "enamorado"],
  ["sadness", "sad", "crying", "cry", "tristeza", "triste", "llorando"],
  ["anger", "angry", "furious", "ira", "enojado", "enfado"],
  ["fear", "scared", "afraid", "miedo", "asustado"],
  ["thought", "thinking", "pensamiento", "pensando"],
  ["sleep", "sleeping", "asleep", "sueno", "dormir", "durmiendo"],
  ["surprise", "surprised", "shocked", "sorpresa", "sorprendido"],
  ["anxiety", "anxious", "worried", "ansiedad", "preocupado"],
  ["celebration", "celebrating", "party", "celebracion", "fiesta"],
  ["hug", "hugging", "abrazo", "abrazando"],
  ["wink", "winking", "guino"],
  ["waving", "waving hand", "wave hello", "saludo", "saludando"],
  ["applause", "clapping", "aplauso", "aplausos", "aplaudiendo"],
  ["dance", "dancing", "danza", "baile", "bailando"],
  ["ocean", "sea", "waves", "oceano", "mar", "olas"],
  ["crescent", "moon", "crescent moon", "fase lunar", "luna"],
  ["planetary ring", "ringed planet", "saturn", "anillo planetario", "saturno"],
  ["musical keyboard", "piano", "teclado instrumento musical"],
  ["incandescent light bulb", "light bulb", "lampara incandescente", "bombilla"],
  ["association football", "soccer", "futbol"],
  ["heart symbol", "heart", "corazon simbolo"],
  ["human heart", "anatomical heart", "corazon humano", "corazon anatomico"],
  ["brain", "human brain", "cerebro"],
  ["dog", "dogs", "puppy", "perro", "perros", "cachorro"],
  ["cat", "cats", "kitten", "gato", "gatos", "gatito"],
  ["cattle", "cow", "cows", "bos taurus", "vaca", "vacas"],
  ["giant panda", "panda gigante", "panda"],
];

const clean = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const subject = (text: string) => clean(text.replace(/\s*\([^)]*\)/g, ""));
const groupFor = (term: string) => equivalents.find(group => group.includes(term));
const contains = (text: string, term: string) => Boolean(term) &&
  (` ${clean(text)} `.includes(` ${term} `) || ` ${clean(text)} `.includes(` ${term}s `));

export type GifMatchContext = { topic: TopicCandidate; emoji: EmojiRecord };
export type GifCandidate = MediaItem & { description?: string; slug?: string };

function matchTerms(query: string, locale: Locale, context?: GifMatchContext) {
  const primary = new Set([subject(query)]);
  const emojiTerms: string[] = [];
  if (context) {
    const selected = subject(context.topic.englishQuery);
    primary.add(selected);
    const original = subject(defaultTopic(context.emoji, locale).englishQuery);
    const sameSubject = selected === original || Boolean(groupFor(original)?.includes(selected));
    // Following a related article or choosing another subject must replace the
    // original emoji associations, as it does for the other media sections.
    if (sameSubject) Object.values(context.emoji.labels).forEach(label => {
      const term = subject(label);
      primary.add(term); emojiTerms.push(term);
    });
  }
  primary.delete("");
  const related = new Set([...primary].flatMap(term => groupFor(term) || []));
  primary.forEach(term => related.delete(term));
  return { primary: [...primary], related: [...related], emojiTerms };
}

export function rankGifs(candidates: GifCandidate[], query: string, locale: Locale, context?: GifMatchContext): MediaItem[] {
  const { primary, related, emojiTerms } = matchTerms(query, locale, context);
  const ranked = candidates.map((item, index) => {
    const evidence = (terms: string[]) => {
      const description = terms.some(term => contains(item.description || "", term));
      // Creator names are attribution, not evidence of what is in the GIF.
      const title = terms.some(term => contains(item.title.replace(/\s+by\s+.+$/i, ""), term));
      const rawSlug = item.slug || "";
      const contentSlug = rawSlug.endsWith(`-${item.id}`) ? rawSlug.slice(0, -item.id.length - 1) : rawSlug;
      const slug = terms.some(term => contains(contentSlug, term));
      return { description, title, slug };
    };
    const direct = evidence(primary), synonym = evidence(related), exactEmoji = evidence(emojiTerms);
    // Descriptive metadata beats keywords in URL slugs; direct subject phrases
    // beat related reactions. Provider order breaks ties between equal matches.
    const score = Math.max(exactEmoji.description ? 120 : 0, exactEmoji.title ? 110 : 0,
      direct.description ? 100 : 0, direct.title ? 90 : 0,
      synonym.description ? 80 : 0, synonym.title ? 70 : 0, direct.slug ? 50 : 0, synonym.slug ? 40 : 0)
      + (direct.description && direct.title ? 5 : 0);
    return { item, index, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const ids = new Set<string>(), previews = new Set<string>(), sources = new Set<string>();
  return ranked.flatMap(({ item }) => {
    if (ids.has(item.id) || previews.has(item.previewUrl || "") || sources.has(item.sourceUrl)) return [];
    ids.add(item.id); previews.add(item.previewUrl || ""); sources.add(item.sourceUrl);
    const { description: _description, slug: _slug, ...media } = item;
    return [media];
  }).slice(0, GIF_RESULT_LIMIT);
}

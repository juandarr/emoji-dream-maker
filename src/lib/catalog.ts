import enData from "emojibase-data/en/compact.json";
import esData from "emojibase-data/es/compact.json";
import { aliases } from "./aliases";
import { conceptFor } from "./concepts";
import type { EmojiRecord, Locale, TopicCandidate } from "./types";

type Raw = { hexcode: string; unicode: string; label?: string; annotation?: string; tags?: string[]; group?: number; order?: number; skins?: Raw[] };
const spanish = new Map((esData as Raw[]).map(e => [e.hexcode, e]));
const label = (e: Raw) => e.label || e.annotation || e.unicode;

export const catalog: EmojiRecord[] = (enData as Raw[])
  .filter(e => e.group !== undefined && e.group !== 2)
  .map((e, index) => {
    const es = spanish.get(e.hexcode) || e;
    const extra = aliases[e.hexcode];
    return {
      id: e.hexcode, glyph: e.unicode, labels: { en: label(e), es: label(es) },
      keywords: { en: [...(e.tags || []), ...(extra?.en || [])], es: [...(es.tags || []), ...(extra?.es || [])] },
      group: e.group!, order: e.order ?? index,
      variants: (e.skins || []).map(v => ({ id: v.hexcode, glyph: v.unicode, labels: { en: label(v), es: label(spanish.get(v.hexcode) || es.skins?.find(s => s.hexcode === v.hexcode) || v) } })),
      association: extra?.association,
    };
  });
export const emojiById = new Map(catalog.map(e => [e.id, e]));

export const categories = [
  { id: 0, icon: "😊", en: "Feelings", es: "Emociones" },
  { id: 1, icon: "👋", en: "People", es: "Personas" },
  { id: 3, icon: "🦋", en: "Nature", es: "Naturaleza" },
  { id: 4, icon: "🍓", en: "Food", es: "Comida" },
  { id: 5, icon: "🌍", en: "Places", es: "Lugares" },
  { id: 6, icon: "🎨", en: "Activities", es: "Actividades" },
  { id: 7, icon: "💡", en: "Objects", es: "Objetos" },
  { id: 8, icon: "✨", en: "Symbols", es: "Símbolos" },
  { id: 9, icon: "🏳️", en: "Flags", es: "Banderas" },
];
const preferred = ["🌙", "🪐", "🌊", "🐙", "🦋", "🌸", "🌻", "🐋", "🍄", "🦊", "🐢", "🍓", "🍋", "☕", "🥑", "🍒", "🍰", "🧋", "🗼", "🌋", "🏝️", "🌈", "🚀", "🌌", "🗽", "🎨", "🎹", "🎭", "🎸", "⚽", "🧘", "🎪", "💡", "🔭", "📚", "🕯️", "🧭", "🧸", "💌", "✨", "❤️", "☮️", "♾️", "😊", "🥰", "😴", "🤔", "👋", "🫶", "🧠", "🇨🇴", "🇯🇵"];
function balanced(items: EmojiRecord[]) {
  const buckets = categories.map(c => items.filter(e => e.group === c.id).sort((a,b) => {
    const ai = preferred.indexOf(a.glyph), bi = preferred.indexOf(b.glyph);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.order - b.order;
  }));
  const result: EmojiRecord[] = [];
  for (let i = 0; result.length < items.length; i++) for (const bucket of buckets) if (bucket[i]) result.push(bucket[i]);
  return result;
}
export function normalize(text: string) { return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim(); }
export function searchCatalog(query: string, group: number | null = null): EmojiRecord[] {
  const candidates = group === null ? catalog : catalog.filter(e => e.group === group);
  const q = normalize(query);
  if (!q) return balanced(candidates);
  const terms = q.split(/\s+/);
  return candidates.map(emoji => {
    const labels = Object.values(emoji.labels).map(normalize);
    const keywords = [...emoji.keywords.en, ...emoji.keywords.es].map(normalize);
    const all = [...labels, ...keywords];
    const score = normalize(emoji.glyph) === q || emoji.variants.some(v => normalize(v.glyph) === q) || labels.includes(q) ? 0 : keywords.includes(q) ? 1 : all.some(v => v.startsWith(q)) ? 2 : terms.every(t => all.some(v => v.includes(t))) ? 3 : Infinity;
    return { emoji, score };
  }).filter(e => Number.isFinite(e.score)).sort((a,b) => a.score - b.score || a.emoji.order - b.emoji.order).map(e => e.emoji);
}
export function defaultTopic(emoji: EmojiRecord, locale: Locale): TopicCandidate {
  const flagCountry=emoji.labels.en.startsWith("flag: ")?emoji.labels.en.slice(6):null;
  const esCountry=emoji.labels.es.replace(/^bandera:\s*/i,"");
  const mapped = aliases[emoji.id]?.topic || conceptFor(emoji) || (flagCountry?{en:`Flag of ${flagCountry}`,es:`Bandera de ${esCountry}`}:undefined);
  return { label: mapped?.[locale] || emoji.labels[locale], language: locale, query: mapped?.[locale] || emoji.labels[locale], englishQuery: mapped?.en || emoji.labels.en };
}

export type ConstellationPosition = { x:number; y:number; radius:number; angle:number; duration:number };

// Category ordering gives each group a sector; three lanes keep the center clear.
export function constellationPositions(items: EmojiRecord[]) {
  const positions=new Map<string,ConstellationPosition>();
  const sorted=[...items].sort((a,b)=>a.group-b.group||a.order-b.order);
  sorted.forEach((emoji,index)=>{
    const lane=index%3;
    const count=Math.ceil((items.length-lane)/3);
    const angle=-135+Math.floor(index/3)*360/count+lane*9;
    const radius=29+lane*6;
    const radians=angle*Math.PI/180;
    positions.set(emoji.id,{x:50+radius*Math.cos(radians),y:50+radius*Math.sin(radians),radius,angle,duration:90+lane*30});
  });
  return items.map(e=>positions.get(e.id)!);
}

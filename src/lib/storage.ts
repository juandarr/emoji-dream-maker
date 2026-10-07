import { emojiById } from "./catalog";
import type { Discovery, TopicCandidate } from "./types";
import { isTheme, type Theme } from "./themes";
export const storageKey = "dream-maker-v1";
export type Preferences = { locale: "en" | "es"; theme: Theme; view: "constellation" | "grid" | "list"; reduced: boolean; favorites: Discovery[]; history: Discovery[] };
export const initialPreferences: Preferences = { locale: "en", theme: "classic", view: "constellation", reduced: false, favorites: [], history: [] };
export function validTopic(value: unknown): value is TopicCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const t = value as TopicCandidate;
  return [t.label,t.query,t.englishQuery].every(v=>typeof v === "string" && v.trim().length > 0 && v.length <= 150) && ["en","es"].includes(t.language) && (t.wikiTitle === undefined || typeof t.wikiTitle === "string" && t.wikiTitle.trim().length > 0 && t.wikiTitle.length <= 200 && !t.wikiTitle.includes("|")) && (t.wikiId === undefined || Number.isSafeInteger(t.wikiId) && t.wikiId > 0) && (t.description === undefined || typeof t.description === "string" && t.description.length <= 2000) && (t.suggested === undefined || typeof t.suggested === "boolean");
}
function discoveries(value: unknown, limit: number): Discovery[] {
  if (!Array.isArray(value)) return [];
  return value.filter(d=>d && emojiById.has(d.emojiId) && validTopic(d.topic) && typeof d.at === "number" && Number.isFinite(d.at)).slice(0,limit).map(d=>({emojiId:d.emojiId,topic:d.topic,at:d.at}));
}
export function readPreferences(storage: Pick<Storage,"getItem">): Preferences {
  try {
    const p = JSON.parse(storage.getItem(storageKey) || "{}");
    return { locale: p.locale === "es" ? "es" : "en", theme: isTheme(p.theme) ? p.theme : "classic", view: ["grid","list"].includes(p.view) ? p.view : "constellation", reduced: p.reduced === true, favorites: discoveries(p.favorites,200), history: discoveries(p.history,50) };
  } catch { return {...initialPreferences}; }
}
export function savePreferences(storage: Pick<Storage,"setItem">, p: Preferences) { try { storage.setItem(storageKey,JSON.stringify(p)); return true; } catch { return false; } }
export const discoveryKey = (d: Pick<Discovery,"emojiId"|"topic">) => `${d.emojiId}:${d.topic.language}:${d.topic.wikiId || d.topic.wikiTitle || normalizeTopic(d.topic.label)}`;
function normalizeTopic(s: string) { return s.toLowerCase().trim(); }
export function remember(list: Discovery[], item: Discovery, limit: number) { return [item, ...list.filter(d=>discoveryKey(d)!==discoveryKey(item))].slice(0,limit); }

import { describe, expect, it } from "vitest";
import { defaultTopic, searchCatalog } from "@/lib/catalog";
import { initialPreferences, readPreferences, remember, savePreferences, validTopic } from "@/lib/storage";
const emoji=searchCatalog("octopus")[0];
const discovery={emojiId:emoji.id,topic:defaultTopic(emoji,"en"),at:1};
describe("local discoveries",()=>{
  it("survives corrupt or inaccessible storage",()=>{expect(readPreferences({getItem:()=>"{broken"})).toEqual(initialPreferences);expect(readPreferences({getItem:()=>{throw new Error();}})).toEqual(initialPreferences);expect(savePreferences({setItem:()=>{throw new Error();}},initialPreferences)).toBe(false);});
  it("validates saved records and bounds history",()=>{const preferences=readPreferences({getItem:()=>JSON.stringify({locale:"es",history:[...Array.from({length:60},()=>discovery),{emojiId:"not-an-emoji",topic:discovery.topic,at:1}],favorites:[{...discovery,topic:{label:"invalid"}}]})});expect(preferences.locale).toBe("es");expect(preferences.history).toHaveLength(50);expect(preferences.favorites).toHaveLength(0);});
  it("deduplicates revisits without losing separate interpretations",()=>{const heart=searchCatalog("❤️")[0];const love={emojiId:heart.id,topic:defaultTopic(heart,"en"),at:1};const anatomy={...love,topic:{...love.topic,label:"Human heart",wikiTitle:"Human heart"}};expect(remember([love,anatomy],{...love,at:2},50)).toEqual([{...love,at:2},anatomy]);});
  it("round-trips preferences without storing media",()=>{let value="";savePreferences({setItem:(_k,v)=>{value=v;}},{...initialPreferences,favorites:[discovery]});expect(readPreferences({getItem:()=>value}).favorites).toEqual([discovery]);expect(value).not.toContain("previewUrl");});
  it("rejects invalid languages, oversized titles and malformed topics",()=>{expect(validTopic({...discovery.topic,language:"xx"})).toBe(false);expect(validTopic({...discovery.topic,wikiTitle:"x".repeat(201)})).toBe(false);expect(validTopic(null)).toBe(false);});
});

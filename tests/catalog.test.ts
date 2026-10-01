import { describe, expect, it } from "vitest";
import { catalog, categories, constellationPositions, defaultTopic, searchCatalog } from "@/lib/catalog";
describe("bilingual emoji discovery",()=>{
  it("finds the same octopus in both languages",()=>{expect(searchCatalog("octopus")[0].glyph).toBe("🐙");expect(searchCatalog("pulpo")[0].glyph).toBe("🐙");expect(defaultTopic(searchCatalog("pulpo")[0],"es")).toMatchObject({query:"Octopoda",englishQuery:"Octopus"});});
  it("normalizes accents and case",()=>{expect(searchCatalog("CORAZÓN").map(e=>e.id)).toEqual(searchCatalog("corazon").map(e=>e.id));});
  it("prioritizes a complete label and preserves stable ties",()=>{expect(searchCatalog("red heart")[0].glyph).toBe("❤️");expect(searchCatalog("ocean")).toEqual(searchCatalog("ocean"));});
  it("keeps flags and compound sequences intact",()=>{expect(searchCatalog("🇨🇴")[0].glyph).toBe("🇨🇴");const family=catalog.find(e=>e.glyph==="👨‍👩‍👧‍👦");expect(family?.glyph).toBe("👨‍👩‍👧‍👦");});
  it("finds a base emoji from a skin-tone variant",()=>{const hand=searchCatalog("👋🏽")[0];expect(hand.glyph).toBe("👋");expect(hand.variants.some(v=>v.glyph==="👋🏽")).toBe(true);});
  it("balances the initial page and honors category filtering",()=>{const first=searchCatalog("").slice(0,48);expect(new Set(first.map(e=>e.group)).size).toBe(categories.length);expect(searchCatalog("",3).every(e=>e.group===3)).toBe(true);});
  it("provides a literal love subject and labels landmark associations",()=>{expect(defaultTopic(searchCatalog("❤️")[0],"en").query).toBe("Love");expect(searchCatalog("paris")[0].association?.en).toContain("Tokyo Tower");});
  it("keeps every displayed emoji in a unique, stable position outside the portal",()=>{for(const query of ["","animal","heart","food"]){const items=searchCatalog(query).slice(0,48);const positions=constellationPositions(items);expect(positions).toEqual(constellationPositions(items));expect(new Set(positions.map(p=>`${p.x}:${p.y}`)).size).toBe(items.length);expect(positions.every(p=>Math.hypot(p.x-50,p.y-50)>26)).toBe(true);}});
  it("responds within the search budget",()=>{const start=performance.now();searchCatalog("ocean");expect(performance.now()-start).toBeLessThan(100);});
});

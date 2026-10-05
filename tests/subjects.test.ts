import { describe, expect, it } from "vitest";
import { categories } from "@/lib/catalog";
import { emojisForSubject, subjects } from "@/lib/subjects";

describe("curated discovery subjects", () => {
  it("keeps every subject populated with real, unique catalog emojis", () => {
    for (const subject of subjects) {
      const emojis = emojisForSubject(subject.id);
      expect(emojis.length, subject.id).toBe(subject.glyphs.split(" ").length);
      expect(new Set(emojis.map(emoji => emoji.id)).size, subject.id).toBe(emojis.length);
      expect(emojis.length, subject.id).toBeGreaterThanOrEqual(4);
    }
  });

  it("adds the requested topics without changing the standard categories", () => {
    expect(subjects).toHaveLength(16);
    expect(subjects.map(subject => subject.id)).toEqual(expect.arrayContaining(["sports", "clothes", "tools", "birds", "fish"]));
    expect(categories.map(category => category.id)).toEqual([0, 1, 3, 4, 5, 6, 7, 8, 9]);
    expect(emojisForSubject("fish").map(emoji => emoji.labels.en)).toContain("shark");
  });

  it("keeps the original prompts curated, especially love", () => {
    expect(subjects.slice(0, 4).map(subject => subject.id)).toEqual(["ocean", "music", "love", "space"]);
    const loveGlyphs = new Set(emojisForSubject("love").map(emoji => emoji.glyph.replace(/[\uFE0E\uFE0F]/g, "")));
    expect(loveGlyphs.size).toBeGreaterThan(48);
    for (const glyph of ["❤️", "💓", "🩷", "😘", "😻", "🫰", "🤟", "💏", "👩‍❤️‍👩", "🌹", "🏩"]) {
      expect(loveGlyphs.has(glyph.replace(/[\uFE0E\uFE0F]/g, "")), glyph).toBe(true);
    }
    for (const unrelated of ["🇸🇮", "🧤", "🥊", "🥎", "🍀"]) {
      expect(loveGlyphs.has(unrelated), unrelated).toBe(false);
    }
  });

  it("covers distinct meanings across the expanded subjects", () => {
    const representative: Record<string, string[]> = {
      ocean: ["🐙", "🪸", "🐋"], music: ["🎻", "🪘", "🧑‍🎤"],
      space: ["🌑", "🛸", "🧑‍🚀"], sports: ["🥎", "🏊", "🤾‍♀️"],
      clothes: ["🥻", "🧤", "🩰"], tools: ["🪛", "🪚", "🪜"],
      birds: ["🪿", "🐦‍🔥", "🪺"], fish: ["🐟", "🐠", "🐡", "🦈"],
      weather: ["🌪️", "☔", "❄️"], travel: ["🧳", "🚄", "⛵"],
      home: ["🛋️", "🧹", "🍽️"], health: ["🩺", "🫀", "🧑‍⚕️"],
      technology: ["💻", "🎮", "📡"], plants: ["🌵", "🪷", "🪾"],
      science: ["🔬", "🧬", "🧑‍🔬"],
    };
    for (const [id, glyphs] of Object.entries(representative)) {
      const actual = new Set(emojisForSubject(id).map(emoji => emoji.glyph.replace(/[\uFE0E\uFE0F]/g, "")));
      for (const glyph of glyphs) expect(actual.has(glyph.replace(/[\uFE0E\uFE0F]/g, "")), `${id}: ${glyph}`).toBe(true);
    }
    expect(emojisForSubject("fish")).toHaveLength(4);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artSearchPlan, rankArt } from "@/lib/art-selection";
import { clearProviderCache, discover } from "@/lib/providers";
import type { ArtCandidate } from "@/lib/art-selection";
import type { TopicCandidate } from "@/lib/types";
const topic = (query: string): TopicCandidate => ({ label: query, query, englishQuery: query, language: "en" });
const candidate = (title: string, extra: Partial<ArtCandidate> = {}): ArtCandidate => ({ id: title, title, previewUrl: "https://images.metmuseum.org/a.jpg", imageUrl: `https://images.metmuseum.org/${title}.jpg`, sourceUrl: "https://www.metmuseum.org/art/collection/search/1", ...extra });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const cma = (id: number, title: string, extra = {}) => ({ id, title, share_license_status: "CC0", url: `https://clevelandart.org/art/${id}`, type: "Painting", images: { web: { url: `https://openaccess-cdn.clevelandart.org/${id}_web.jpg`, width: "900", height: "700" }, print: { url: `https://openaccess-cdn.clevelandart.org/${id}_print.jpg` } }, ...extra });
beforeEach(clearProviderCache);
afterEach(() => vi.unstubAllGlobals());
describe("visual relevance", () => {
  it("expands visual concepts and uses English translation in Spanish", () => {
    expect(artSearchPlan(topic("Musical note")).queries).toEqual(["music", "musician", "instrument"]);
    expect(artSearchPlan({ ...topic("Love"), label: "Amor", language: "es" }).terms).toContain("cupid");
    expect(artSearchPlan(topic("Crescent")).queries[0]).toBe("moon");
    expect(artSearchPlan(topic("Statue of Liberty")).queries).toEqual(["statue of liberty"]);
  });
  it("requires a full phrase or word, not incidental artist names or substrings", () => {
    expect(rankArt([candidate("Cat"), candidate("Cathedral"), candidate("Landscape", { creator: "Cat Smith" }), candidate("Cattle")], topic("Cat")).map(item => item.title)).toEqual(["Cat"]);
    expect(rankArt([candidate("Statue"), candidate("Liberty"), candidate("Statue of Liberty"), candidate("Papal Medal of Alexander VII", { subjects: ["Statue of Liberty"] })], topic("Statue of Liberty")).map(item => item.title)).toEqual(["Statue of Liberty"]);
    expect(rankArt([candidate("Houses on the Fox River, Illinois"), candidate("Two Foxes")], topic("Fox")).map(item => item.title)).toEqual(["Two Foxes"]);
  });
  it("prefers direct paintings over other art and descriptions, retaining the matching term", () => {
    const results = rankArt([candidate("Panel", { description: "A carved octopus appears in the scene.", kind: "Woodwork" }), candidate("Octopus plate", { kind: "Ceramics" }), candidate("Octopus painting", { kind: "Painting" }), candidate("Fish plate", { subjects: ["Octopi"], kind: "Ceramics" })], topic("Octopus"));
    expect(results.map(item => item.title)).toEqual(["Octopus painting", "Octopus plate", "Fish plate", "Panel"]);
    expect(results[2].matchedTerm).toBe("octopi");
  });
  it("never pads results, removes duplicates and caps at five", () => {
    const items = Array.from({ length: 8 }, (_, index) => candidate(`Moon ${index}`));
    expect(rankArt([items[0], { ...items[0], id: "duplicate" }, ...items.slice(1)], topic("Moon"))).toHaveLength(5);
    expect(rankArt([candidate("Unrelated")], topic("Octopus"))).toEqual([]);
    expect(rankArt([candidate("Landscape", { kind: "Painting" }), candidate("Unrelated sculpture", { kind: "Sculpture" })], topic("Painting"))).toHaveLength(1);
  });
  it("avoids incidental anatomical descriptions and preserves unknown disambiguators", () => {
    expect(rankArt([candidate("Sacrificial basin", { description: "The scene shows offerings including a human heart." }), candidate("Human heart diagram")], topic("Human heart")).map(item => item.title)).toEqual(["Human heart diagram"]);
    expect(artSearchPlan(topic("Bass (fish)")).queries).toEqual(["bass fish"]);
    expect(artSearchPlan(topic("Surprise (emotion)")).terms).toContain("astonishment");
  });
  it("makes room for different artists, series and collections among relevant images", () => {
    const results = rankArt([candidate("Love scene 1, from a Romance", { kind: "Painting", creator: "One artist", collection: "One museum" }), candidate("Love scene 2, from a Romance", { kind: "Painting", creator: "One artist", collection: "One museum" }), candidate("Love scene 3, from a Romance", { kind: "Painting", creator: "One artist", collection: "One museum" }), candidate("Cupid", { kind: "Painting", creator: "Another artist", collection: "Another museum" })], topic("Love"));
    expect(results[1].title).toBe("Cupid");
  });
  it("uses a changed concept instead of lingering emoji associations", () => {
    expect(rankArt([candidate("Cupid"), candidate("Human heart diagram")], topic("Human heart")).map(item => item.title)).toEqual(["Human heart diagram"]);
  });
});
describe("trusted image providers", () => {
  it("verifies rights, quality and direct museum image URLs, then combines and caches sources", async () => {
    const fetch = vi.fn().mockImplementation(async url => {
      const address = String(url);
      if (address.includes("cleveland")) return response({ data: [cma(1, "Octopus painting"), cma(2, "Copyrighted octopus", { share_license_status: "Copyrighted" }), cma(3, "Tiny octopus", { images: { web: { url: "https://openaccess-cdn.clevelandart.org/tiny.jpg", width: "100", height: "100" } } }), cma(4, "Wrong host octopus", { url: "https://untrusted.example/art" }), cma(5, "Missing octopus", { images: null }), cma(6, "Unrelated") ] });
      if (address.includes("/search?")) return response({ objectIDs: [9, 10] });
      return response({ objectID: address.endsWith("/9") ? 9 : 10, title: "Octopus drawing", isPublicDomain: address.endsWith("/9"), primaryImage: "https://images.metmuseum.org/original.jpg", primaryImageSmall: "https://images.metmuseum.org/small.jpg", tags: [{ term: "Octopus" }] });
    });vi.stubGlobal("fetch", fetch);
    const input = { emojiId: "1F419", provider: "art" as const, locale: "en" as const, topic: topic("Octopus") };
    const result = await discover(input, new AbortController().signal);
    expect(result.items.map(item => item.id)).toEqual(["cleveland:1", "met:9"]);
    expect(result.items.every(item => item.collection && item.license === "CC0" && item.imageUrl)).toBe(true);
    const search = fetch.mock.calls.map(([url]) => new URL(String(url))).find(url => url.hostname === "collectionapi.metmuseum.org" && url.pathname.endsWith("search"))!;
    expect(search.pathname).toContain("v1.1");expect(search.searchParams.get("limit")).toBe("12");expect(search.searchParams.get("hasImages")).toBe("true");
    const count = fetch.mock.calls.length;await discover(input, new AbortController().signal);expect(fetch).toHaveBeenCalledTimes(count);
  });
  it("keeps successful museum images when the other source fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async url => String(url).includes("cleveland") ? response({ data: [cma(1, "Moonshine landscape")] }) : response({}, 503)));
    const result = await discover({ emojiId: "1F319", provider: "art", locale: "en", topic: topic("Moon") }, new AbortController().signal);
    // Unlisted word fragments are not evidence of the selected subject.
    expect(result.status).toBe("empty");expect(result.partial).toBe(true);
    clearProviderCache();vi.stubGlobal("fetch", vi.fn().mockImplementation(async url => String(url).includes("cleveland") ? response({ data: [cma(1, "Moon landscape")] }) : response({}, 503)));
    const next = await discover({ emojiId: "1F319", provider: "art", locale: "en", topic: topic("Moon") }, new AbortController().signal);
    expect(next.status).toBe("ready");expect(next.items).toHaveLength(1);expect(next.partial).toBe(true);
  });
  it("keeps usable detail responses and reports incomplete retrieval", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async url => {
      const address = String(url);
      if (address.includes("cleveland")) return response({ data: [] });
      if (address.includes("/search?")) return response({ objectIDs: [1, 2] });
      return address.endsWith("/2") ? response({}, 429) : response({ objectID: 1, title: "Moon", isPublicDomain: true, primaryImage: "https://images.metmuseum.org/moon.jpg" });
    }));
    const result = await discover({ emojiId: "1F319", provider: "art", locale: "en", topic: topic("Moon") }, new AbortController().signal);
    expect(result.items).toHaveLength(1);expect(result.partial).toBe(true);
  });
  it("does not fetch details when searches are empty", async () => {
    const fetch = vi.fn().mockImplementation(async url => response(String(url).includes("cleveland") ? { data: [] } : { objectIDs: null }));vi.stubGlobal("fetch", fetch);
    const result = await discover({ emojiId: "1F5FD", provider: "art", locale: "en", topic: topic("Statue of Liberty") }, new AbortController().signal);
    expect(result.status).toBe("empty");expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it("refills museum detail slots while a slow earlier object is still pending", async () => {
  const { discoverArt } = await import("@/lib/art");
  let release!: () => void;
  let active = 0, peak = 0;
  const requested: number[] = [];
  const getJSON = vi.fn(async (url: URL | string) => {
    const address = String(url);
    if (address.includes("cleveland")) return { data: [] };
    if (address.includes("/search?")) return { objectIDs: [1, 2, 3, 4, 5, 6] };
    const id = Number(address.split("/").at(-1));
    requested.push(id); active++; peak = Math.max(active, peak);
    if (id === 1) await new Promise<void>(resolve => { release = resolve; });
    active--;
    return { objectID: id, title: `Octopus ${id}`, isPublicDomain: true, primaryImage: `https://images.metmuseum.org/${id}.jpg` };
  });
  const pending = discoverArt(topic("Octopus"), new AbortController().signal, getJSON as Parameters<typeof discoverArt>[2]);
  await vi.waitFor(() => expect(requested).toContain(6));
  expect(active).toBe(1); expect(peak).toBeLessThanOrEqual(4);
  release();
  expect((await pending).items).toHaveLength(5);
});

it("does not search entire museum collections when a subject has no searchable terms", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const result = await discover({ emojiId: "1F419", provider: "art", locale: "en", topic: topic("✨") }, new AbortController().signal);
  expect(result.status).toBe("empty"); expect(fetch).not.toHaveBeenCalled();
});

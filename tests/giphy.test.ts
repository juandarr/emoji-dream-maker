import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultTopic, searchCatalog } from "@/lib/catalog";
import { rankGifs, type GifCandidate } from "@/lib/gif-selection";
import { searchGiphy } from "@/lib/giphy";

const signal = () => new AbortController().signal;
const emoji = searchCatalog("octopus")[0];
const context = { emoji, topic: defaultTopic(emoji, "en") };
const candidate = (id: string, title: string, extra: Partial<GifCandidate> = {}): GifCandidate => ({
  id, title, sourceUrl: `https://giphy.com/gifs/${id}`, previewUrl: `https://media.giphy.com/${id}.gif`, ...extra,
});
const gif = (id: string, title: string, extra: object = {}) => ({
  id, title, url: `https://giphy.com/gifs/${id}`,
  images: { fixed_width: { url: `https://media.giphy.com/${id}.gif`, frames: "12" } }, ...extra,
});
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_GIPHY_API_KEY", "test-browser-key"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("GIF relevance", () => {
  it("selects the three strongest matches from the entire pool, preserving equal-match order", () => {
    const items = rankGifs([
      candidate("unrelated", "Ocean fish"),
      candidate("slug", "Animation", { slug: "octopus-slug" }),
      candidate("synonym", "Octopi GIF"),
      candidate("direct", "Octopus GIF"),
      candidate("description", "Underwater GIF", { description: "An octopus swims underwater." }),
      candidate("equal", "Octopus waving GIF"),
    ], "Octopus", "en", context);
    expect(items.map(item => item.id)).toEqual(["description", "direct", "equal"]);
  });

  it("matches translated subjects and narrow reaction equivalents", () => {
    expect(rankGifs([candidate("es", "Pulpo GIF"), candidate("en", "Octopus GIF")], "Octopoda", "es", {
      emoji, topic: defaultTopic(emoji, "es"),
    }).map(item => item.id)).toEqual(["es", "en"]);
    const laughing = searchCatalog("face with tears of joy")[0];
    expect(rankGifs([candidate("related", "Laughing GIF"), candidate("exact", "Face with tears of joy GIF"), candidate("off", "Smile GIF")],
      "Laughter", "en", { emoji: laughing, topic: defaultTopic(laughing, "en") }).map(item => item.id)).toEqual(["exact", "related"]);
  });

  it("replaces emoji associations when the user changes subjects", () => {
    const topic = { ...context.topic, query: "Human heart", englishQuery: "Human heart" };
    expect(rankGifs([candidate("old", "Octopus GIF"), candidate("love", "Love GIF"), candidate("anatomy", "Anatomical heart GIF")],
      topic.query, "en", { emoji, topic }).map(item => item.id)).toEqual(["anatomy"]);
  });

  it("avoids substring and creator-name hits and never pads weak results", () => {
    expect(rankGifs([
      candidate("substring", "Cathedral GIF"), candidate("creator", "Dancing GIF by Cat Studio", { creator: "Cat" }),
      candidate("id", "Dancing GIF", { slug: "dancing-id-cat", id: "cat" }), candidate("match", "Cats GIF"),
    ], "cat", "en").map(item => item.id)).toEqual(["match"]);
    expect(rankGifs([candidate("off", "Dancing GIF")], "octopus", "en")).toEqual([]);
  });

  it("deduplicates IDs, source links, and animated previews", () => {
    const first = candidate("first", "Octopus GIF");
    expect(rankGifs([first, first, candidate("preview-copy", "Octopus GIF", { previewUrl: first.previewUrl }),
      candidate("source-copy", "Octopus GIF", { sourceUrl: first.sourceUrl }), candidate("different", "Octopus GIF")],
    "octopus", "en").map(item => item.id)).toEqual(["first", "different"]);
  });
});

describe("browser GIF retrieval", () => {
  it("keeps the localized search, rating, cancellation and fresh retrieval while expanding the pool", async () => {
    const fetch = vi.fn().mockImplementation(async (_url: URL, _init?: RequestInit) => new Response(JSON.stringify({ data: [
      gif("off", "Fish GIF"), gif("one", "Octopus GIF"), gif("two", "Octopus GIF"), gif("three", "Octopus GIF"), gif("four", "Octopus GIF"),
    ] })));
    vi.stubGlobal("fetch", fetch);
    const requestSignal = signal();
    const result = await searchGiphy("Octopoda", "es", requestSignal, { emoji, topic: defaultTopic(emoji, "es") });
    expect(result.status).toBe("ready");
    expect(result.items.map(item => item.id)).toEqual(["one", "two", "three"]);
    await searchGiphy("Octopoda", "es", signal());
    expect(fetch).toHaveBeenCalledTimes(2);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: "Octopoda", lang: "es", rating: "g", limit: "25" });
    expect(fetch.mock.calls[0][1]).toEqual({ signal: requestSignal, cache: "no-store" });
  });

  it("skips missing media and static images without losing valid animations", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      gif("missing", "Octopus GIF", { images: {} }), gif("unsafe", "Octopus GIF", { url: "javascript:alert(1)" }),
      gif("static", "Octopus GIF", { images: { fixed_width: { url: "https://media.giphy.com/still.gif", frames: "1" } } }),
      gif("fallback", "Octopus GIF", { images: { original: { url: "https://media.giphy.com/original.gif", frames: "8" } } }),
      gif("valid", "Octopus GIF"),
    ] }))));
    expect((await searchGiphy("octopus", "en", signal())).items.map(item => item.id)).toEqual(["fallback", "valid"]);
  });

  it("returns empty for unrelated matches and preserves quota and timeout errors", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [gif("off", "Fish GIF")] })));
    vi.stubGlobal("fetch", fetch);
    expect((await searchGiphy("octopus", "en", signal())).status).toBe("empty");
    fetch.mockResolvedValueOnce(new Response("", { status: 429 }));
    expect((await searchGiphy("octopus", "en", signal())).reason).toBe("quota");
    fetch.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
    expect((await searchGiphy("octopus", "en", AbortSignal.abort())).reason).toBe("timeout");
  });
});

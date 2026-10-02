import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearProviderCache, discover } from "@/lib/providers";
import type { DiscoverInput } from "@/lib/types";

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const input: DiscoverInput = { emojiId: "2764", locale: "en", provider: "freesound", topic: { label: "Love", query: "Love", englishQuery: "Love", language: "en" } };
const recording = (id: number, name: string) => ({ id, name, description: `<p>A recording of ${name}.</p>`, duration: 10, username: `creator-${id}`, url: `https://freesound.org/s/${id}/`, license: "https://creativecommons.org/publicdomain/zero/1.0/", previews: { "preview-hq-mp3": `https://cdn.freesound.org/${id}.mp3` } });
beforeEach(() => { clearProviderCache(); vi.stubEnv("FREESOUND_API_KEY", "test-key"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Freesound discovery", () => {
  it("searches bounded scene pools with useful metadata and caches requests", async () => {
    const fetch = vi.fn().mockImplementation(async (url: URL) => response({ results: [String(url).includes("query=kiss") ? recording(1, "Kiss") : recording(2, "Romantic piano")] }));
    vi.stubGlobal("fetch", fetch);
    const result = await discover(input, new AbortController().signal);
    expect(result.status).toBe("ready"); expect(result.items).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("query"))).toEqual(["kiss", "romantic piano"]);
    for (const [url, options] of fetch.mock.calls) {
      expect(new URL(String(url)).pathname).toBe("/apiv2/search/");
      const params = new URL(String(url)).searchParams;
      expect(params.get("fields")).toContain("tags,description,duration");
      expect(params.get("filter")).toContain('license:("Creative Commons 0" OR "Attribution")');
      expect(params.get("filter")).toContain("duration:[0.3 TO 180]");
      expect(params.get("group_by_pack")).toBe("1"); expect(params.get("page_size")).toBe("30");
      expect(options.headers.Authorization).toBe("Token test-key"); expect(options.signal).toBeInstanceOf(AbortSignal);
    }
    await discover(input, new AbortController().signal); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps relevant results when one scene search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: URL) => String(url).includes("query=kiss") ? response({}, 429) : response({ results: [recording(2, "Romantic piano")] })));
    const result = await discover(input, new AbortController().signal);
    expect(result.status).toBe("ready"); expect(result.partial).toBe(true); expect(result.items[0].title).toBe("Romantic piano");
  });
  it("reports a failed search instead of claiming there are no matching sounds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: URL) => String(url).includes("query=kiss") ? response({}, 429) : response({ results: [] })));
    const result = await discover(input, new AbortController().signal);
    expect(result.status).toBe("unavailable"); expect(result.reason).toBe("quota"); expect(result.items).toEqual([]);
  });
  it("returns successful scenes when another scene reaches its own deadline", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    let waiting = false;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url, options) => {
      if (!String(url).includes("query=kiss")) return Promise.resolve(response({ results: [recording(2, "Romantic piano")] }));
      waiting = true;
      return new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true }));
    }));
    const result = discover(input, new AbortController().signal);
    await vi.waitFor(() => expect(waiting).toBe(true));
    deadline.abort(new DOMException("Scene deadline", "TimeoutError"));
    expect(await result).toMatchObject({ status: "ready", partial: true, items: [{ title: "Romantic piano" }] });
  });
  it("identifies query timeouts and avoids querying the whole library for empty terms", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Scene deadline", "TimeoutError")));
    expect((await discover(input, new AbortController().signal)).reason).toBe("timeout");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await discover({ ...input, topic: { ...input.topic, englishQuery: "✨" } }, new AbortController().signal)).status).toBe("empty");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns empty for weak matches and errors for malformed provider responses", async () => {
    const fetch = vi.fn().mockImplementation(async () => response({ results: [recording(1, "Unrelated bass loop")] })); vi.stubGlobal("fetch", fetch);
    expect((await discover(input, new AbortController().signal)).status).toBe("empty");
    clearProviderCache(); fetch.mockImplementation(async () => response({ wrong: [] }));
    expect((await discover(input, new AbortController().signal)).status).toBe("error");
  });
  it("cancels every scene request when the discovery is abandoned", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      signals.push(options.signal); options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    })));
    const controller = new AbortController();
    const pending = discover(input, controller.signal);
    await vi.waitFor(() => expect(signals).toHaveLength(2)); controller.abort();
    const result = await pending;
    expect(signals.every(signal => signal.aborted)).toBe(true); expect(result.reason).toBe("timeout"); expect(result.items).toEqual([]);
  });
  it("retrieves a new scene when the user changes to the anatomical-heart subject", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ results: [recording(1, "Heartbeat")] })); vi.stubGlobal("fetch", fetch);
    const result = await discover({ ...input, topic: { ...input.topic, englishQuery: "Human heart", label: "Human heart", query: "Human heart" } }, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(1); expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("query")).toBe("heartbeat");
    expect(result.items[0].soundConnection?.kind).toBe("direct");
  });
});

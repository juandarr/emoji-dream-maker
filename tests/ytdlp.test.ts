import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverYouTube, clearYouTubeCache } from "@/lib/youtube";
import { ytDlpCandidate } from "@/lib/ytdlp";
import { YouTubeError } from "@/lib/youtube-error";
import { selectLearningCandidates } from "@/lib/youtube-selection";

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/ytdlp-process", () => ({ runYtDlp: run }));
const topic = { label: "Octopus", query: "Octopus", englishQuery: "Octopus", language: "en" as const };
const educator = "UCsooa4yRKGN_zEE8iknghZA";
const entry = (id = "abcdefghijk", extra = {}) => ({ id, title: "Octopus biology explained", channel: "TED-Ed", channel_id: educator, duration: 480, ...extra });
const detail = (id = "abcdefghijk", extra = {}) => entry(id, { availability: "public", playable_in_embed: true, live_status: "not_live", age_limit: 0, ...extra });
function succeed(entries = [entry()]) {
  run.mockImplementation(async (args: string[]) => args.includes("--flat-playlist") ? { entries } : detail(args.at(-1)!.split("=").at(-1)));
}
beforeEach(() => {
  clearYouTubeCache(); run.mockReset(); vi.stubEnv("YOUTUBE_PROVIDER", "yt-dlp"); vi.stubEnv("YOUTUBE_API_KEY", ""); vi.stubEnv("YTDLP_PATH", "test-yt-dlp"); vi.stubEnv("YTDLP_PYTHON_ARCHIVE", "");
});
afterEach(() => { clearYouTubeCache(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("yt-dlp discovery", () => {
  it("retries incomplete final selections instead of keeping them for an hour", async () => {
    vi.stubEnv("YOUTUBE_PROVIDER", "api"); vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const candidates = ["abcdefghijk", "lmnopqrstuv", "12345678901"].map(id => ytDlpCandidate(entry(id))!);
    const api = vi.fn().mockResolvedValueOnce(candidates.slice(0, 1)).mockResolvedValue(candidates);
    const signal = new AbortController().signal;
    expect(await discoverYouTube(topic, "en", signal, api)).toHaveLength(1);
    expect(await discoverYouTube(topic, "en", signal, api)).toHaveLength(3);
    expect(await discoverYouTube(topic, "en", signal, api)).toHaveLength(3);
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("retains English fallback lessons when both localized searches fail", async () => {
    run.mockImplementation(async (args: string[]) => {
      if (!args.at(-1)?.endsWith("explained")) throw new Error("Localized search failed");
      return { entries: [entry(), entry("lmnopqrstuv"), entry("12345678901")] };
    });
    expect(await discoverYouTube(topic, "es", new AbortController().signal, vi.fn())).toHaveLength(3);
  });
  it("works without an API key, deduplicates results, ranks search metadata and caches successful requests", async () => {
    succeed(); const api = vi.fn();
    const results = await discoverYouTube(topic, "en", new AbortController().signal, api);
    expect(results).toHaveLength(1); expect(results[0].durationSeconds).toBe(480);
    expect(results[0].embedUrl).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(run).toHaveBeenCalledTimes(2); expect(api).not.toHaveBeenCalled();
    const searches = run.mock.calls.slice(0, 2).map(call => call[0].at(-1));
    expect(searches).toEqual(["ytsearch20:Octopus explained", "ytsearch20:Octopus documentary"]);
    await discoverYouTube(topic, "en", new AbortController().signal, api);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("returns three distinct lessons without watch-page extraction", async () => {
    succeed(Array.from({ length: 50 }, (_, i) => entry(String(i).padStart(11, "0"))));
    expect(await discoverYouTube(topic, "en", new AbortController().signal, vi.fn())).toHaveLength(3);
    expect(run.mock.calls.filter(call => !call[0].includes("--flat-playlist"))).toHaveLength(0);
  });
  it("shares identical simultaneous discoveries", async () => {
    succeed(); const api = vi.fn();
    const [a, b] = await Promise.all([discoverYouTube(topic, "en", new AbortController().signal, api), discoverYouTube(topic, "en", new AbortController().signal, api)]);
    expect(a).toEqual(b); expect(run).toHaveBeenCalledTimes(2);
  });
  it("does not invent missing approval, captions, engagement or synthetic disclosure", () => {
    const candidate = ytDlpCandidate(entry())!;
    expect(candidate.embeddable).toBeUndefined(); expect(candidate.availability).toBeUndefined();
    expect(candidate.captioned).toBeUndefined(); expect(candidate.likes).toBeUndefined(); expect(candidate.syntheticDisclosure).toBeUndefined();
    expect(selectLearningCandidates([candidate], topic, "en")).toEqual([]);
    const unknown = ytDlpCandidate(detail(undefined, { channel_id: "unknown", automatic_captions: { en: [{}] }, view_count: 10000, like_count: 200 }))!;
    expect(selectLearningCandidates([unknown], topic, "en")).toEqual([]);
    unknown.captioned = true;
    expect(selectLearningCandidates([unknown], topic, "en")).toHaveLength(1);
  });
  it("rejects explicitly restricted search listings and leaves a genuine empty result without fallback", async () => {
    vi.stubEnv("YOUTUBE_PROVIDER", "auto"); vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    run.mockImplementation(async (args: string[]) => args.includes("--flat-playlist") ? { entries: [entry(undefined, { playable_in_embed: false })] } : detail());
    const api = vi.fn(); expect(await discoverYouTube(topic, "en", new AbortController().signal, api)).toEqual([]);
    expect(api).not.toHaveBeenCalled();
  });
  it.each([{ age_limit: 18 }, { availability: "private" }, { live_status: "is_live" }, { playable_in_embed: undefined }, { duration: 30 }, { title: "Octopus AI generated documentary" }])("excludes unsuitable metadata %j", extra => {
    expect(selectLearningCandidates([ytDlpCandidate(detail(undefined, extra))!], topic, "en")).toEqual([]);
  });
  it("returns three even when captions, likes and embedding permission are absent from search metadata", async () => {
    succeed([entry(), entry("lmnopqrstuv"), entry("12345678901")]);
    const items = await discoverYouTube(topic, "en", new AbortController().signal, vi.fn());
    expect(items).toHaveLength(3);
    expect(run.mock.calls.every(call => call[0].includes("--flat-playlist"))).toBe(true);
  });
  it("reuses the selection after Wikipedia enriches the same concept", async () => {
    succeed();
    await discoverYouTube(topic, "en", new AbortController().signal, vi.fn());
    await discoverYouTube({ ...topic, wikiId: 123, wikiTitle: "Octopus" }, "en", new AbortController().signal, vi.fn());
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("uses optional API fallback only after operational failure", async () => {
    vi.stubEnv("YOUTUBE_PROVIDER", "auto"); vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    run.mockRejectedValue(new YouTubeError("setup", "Missing executable"));
    const api = vi.fn().mockResolvedValue([ytDlpCandidate(detail())]);
    expect(await discoverYouTube(topic, "en", new AbortController().signal, api)).toHaveLength(1);
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("propagates API quota exhaustion after yt-dlp failure", async () => {
    vi.stubEnv("YOUTUBE_PROVIDER", "auto"); vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    run.mockRejectedValue(new YouTubeError("quota", "Blocked"));
    await expect(discoverYouTube(topic, "en", new AbortController().signal, async () => { throw new YouTubeError("quota", "Quota exhausted"); })).rejects.toMatchObject({ reason: "quota" });
  });
  it("does not require the API key in auto mode and does not fallback in yt-dlp mode", async () => {
    run.mockRejectedValue(new YouTubeError("setup", "Missing executable")); const api = vi.fn();
    vi.stubEnv("YOUTUBE_PROVIDER", "auto");
    await expect(discoverYouTube(topic, "en", new AbortController().signal, api)).rejects.toMatchObject({ reason: "setup" });
    vi.stubEnv("YOUTUBE_PROVIDER", "yt-dlp"); vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    await expect(discoverYouTube(topic, "en", new AbortController().signal, api)).rejects.toMatchObject({ reason: "setup" });
    expect(api).not.toHaveBeenCalled();
  });
  it("rejects malformed search metadata rather than treating it as no matches", async () => {
    run.mockResolvedValue({ entries: "bad" });
    await expect(discoverYouTube(topic, "en", new AbortController().signal, vi.fn())).rejects.toMatchObject({ reason: "network" });
  });
  it("does not cache operational failures", async () => {
    run.mockRejectedValue(new YouTubeError("network", "Offline"));
    await expect(discoverYouTube(topic, "en", new AbortController().signal, vi.fn())).rejects.toThrow();
    succeed(); expect(await discoverYouTube(topic, "en", new AbortController().signal, vi.fn())).toHaveLength(1);
  });
  it("uses localized queries and caches languages separately", async () => {
    succeed([entry(), entry("lmnopqrstuv"), entry("12345678901")]);
    await discoverYouTube(topic, "es", new AbortController().signal, vi.fn());
    expect(run.mock.calls[0][0]).toContain("ytsearch20:Octopus qué es");
    expect(run.mock.calls[1][0]).toContain("ytsearch20:Octopus documental");
    await discoverYouTube(topic, "en", new AbortController().signal, vi.fn()); expect(run).toHaveBeenCalledTimes(4);
  });
  it("cancels searches when the caller leaves, without starting API fallback", async () => {
    vi.stubEnv("YOUTUBE_PROVIDER", "auto"); vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const signals: AbortSignal[] = [];
    run.mockImplementation((_: string[], signal: AbortSignal) => new Promise((_, reject) => {
      signals.push(signal); signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const controller = new AbortController(); const api = vi.fn();
    const promise = discoverYouTube(topic, "en", controller.signal, api);
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    controller.abort(); await expect(promise).rejects.toThrow();
    expect(signals.every(signal => signal.aborted)).toBe(true); expect(api).not.toHaveBeenCalled();
  });
  it("allows a timed-out yt-dlp stage to fall back, within its separate API budget", async () => {
    vi.useFakeTimers(); vi.stubEnv("YOUTUBE_PROVIDER", "auto"); vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    run.mockImplementation((_: string[], signal: AbortSignal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
    const api = vi.fn().mockResolvedValue([]);
    const promise = discoverYouTube(topic, "en", new AbortController().signal, api);
    await vi.advanceTimersByTimeAsync(8000);
    expect(await promise).toEqual([]); expect(api).toHaveBeenCalledTimes(1);
  });
  it("api mode bypasses yt-dlp and respects the eight-second deadline", async () => {
    vi.useFakeTimers(); vi.stubEnv("YOUTUBE_PROVIDER", "api"); vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const api = vi.fn((signal: AbortSignal) => new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
    const promise = discoverYouTube(topic, "en", new AbortController().signal, api);
    const assertion = expect(promise).rejects.toMatchObject({ reason: "timeout" });
    await vi.advanceTimersByTimeAsync(8000); await assertion;
    expect(run).not.toHaveBeenCalled(); expect(api).toHaveBeenCalledOnce();
  });
  it("fills a sparse Spanish search with distinct lessons about the same concept in English", async () => {
    run.mockImplementation(async (args: string[]) => ({ entries: args.at(-1)?.endsWith("explained")
      ? [entry(), entry("lmnopqrstuv"), entry("12345678901")] : [entry()] }));
    expect(await discoverYouTube(topic, "es", new AbortController().signal, vi.fn())).toHaveLength(3);
    expect(run).toHaveBeenCalledTimes(3);
  });
});

import { describe, expect, it, vi } from "vitest";
import { MetadataCache } from "@/lib/metadata-cache";

describe("shared metadata cache", () => {
  it("shares incomplete results in flight but does not keep them for retries", async () => {
    const cache = new MetadataCache<number[]>(1000, 2, value => value.length === 3);
    const signal = new AbortController().signal;
    const load = vi.fn().mockResolvedValueOnce([1]).mockResolvedValueOnce([1, 2, 3]);
    expect(await Promise.all([cache.get("a", signal, load), cache.get("a", signal, load)])).toEqual([[1], [1]]);
    expect(load).toHaveBeenCalledOnce();
    expect(await cache.get("a", signal, load)).toEqual([1, 2, 3]);
    expect(await cache.get("a", signal, load)).toEqual([1, 2, 3]);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("keeps shared work alive until its last subscriber cancels", async () => {
    const cache = new MetadataCache(); const a = new AbortController(), b = new AbortController();
    let shared: AbortSignal;
    let complete: (value: unknown) => void;
    const load = vi.fn((signal: AbortSignal) => { shared = signal; return new Promise(resolve => { complete = resolve; }); });
    const first = cache.get("key", a.signal, load), second = cache.get("key", b.signal, load);
    await Promise.resolve(); a.abort(); await expect(first).rejects.toThrow();
    expect(shared!.aborted).toBe(false); complete!("ready"); expect(await second).toBe("ready");
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("aborts work with no subscribers and does not reuse the cancelled job", async () => {
    const cache = new MetadataCache(); const controller = new AbortController(); let shared: AbortSignal;
    const job = cache.get("key", controller.signal, signal => { shared = signal; return new Promise(() => {}); });
    await Promise.resolve(); controller.abort(); await expect(job).rejects.toThrow(); expect(shared!.aborted).toBe(true);
    expect(await cache.get("key", new AbortController().signal, async () => "new")).toBe("new");
  });
  it("expires successful entries and evicts the oldest entry at its cap", async () => {
    vi.useFakeTimers();
    try {
      const cache = new MetadataCache(1000, 2); const signal = new AbortController().signal;
      await cache.get("a", signal, async () => 1); await cache.get("b", signal, async () => 2); await cache.get("c", signal, async () => 3);
      const reload = vi.fn(async () => 4); expect(await cache.get("a", signal, reload)).toBe(4);
      await vi.advanceTimersByTimeAsync(1001); expect(await cache.get("a", signal, reload)).toBe(4); expect(reload).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});

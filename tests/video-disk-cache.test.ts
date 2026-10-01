import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readVideoCache, writeVideoCache } from "@/lib/video-disk-cache";
let directory: string;
const items = ["abcdefghijk", "lmnopqrstuv", "12345678901"].map(id => ({ id, title: "Octopus lesson", sourceUrl: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` }));
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "video-cache-")); vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("YOUTUBE_CACHE_DIR", directory); });
afterEach(async () => { vi.unstubAllEnvs(); vi.useRealTimers(); await rm(directory, { recursive: true, force: true }); });
it("persists full selections without storing queries or credentials", async () => {
  await writeVideoCache("private-key and query", items);
  expect(await readVideoCache("private-key and query")).toEqual(items);
  expect(await readVideoCache("other subject")).toBeUndefined();
  expect((await readdir(directory))[0]).toMatch(/^[a-f0-9]{64}\.json$/);
});
it("ignores partial, corrupt and expired selections", async () => {
  await writeVideoCache("partial", items.slice(0, 2)); expect(await readVideoCache("partial")).toBeUndefined();
  await writeVideoCache("complete", items);
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 3_600_001);
  expect(await readVideoCache("complete")).toBeUndefined(); vi.useRealTimers();
  await writeFile(join(directory, (await readdir(directory))[0]), "broken");
  expect(await readVideoCache("complete")).toBeUndefined();
});

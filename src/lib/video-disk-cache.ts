import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MediaItem } from "./types";

const ttl = 3_600_000;
const directory = () => process.env.YOUTUBE_CACHE_DIR || join(process.cwd(), ".cache", "youtube");
const filename = (key: string) => createHash("sha256").update(key).digest("hex") + ".json";
const enabled = () => process.env.YOUTUBE_CACHE_DIR !== "off" && process.env.NODE_ENV !== "test";

export async function readVideoCache(key: string): Promise<MediaItem[] | undefined> {
  if (!enabled()) return;
  try {
    const path = join(directory(), filename(key));
    if ((await stat(path)).size > 32_768) return;
    const value = JSON.parse(await readFile(path, "utf8"));
    if (!Number.isFinite(value.at) || Date.now() - value.at >= ttl || value.at > Date.now() ||
      !Array.isArray(value.items) || value.items.length !== 3) return;
    if (!value.items.every((item: MediaItem) => item && /^[\w-]{11}$/.test(item.id) && typeof item.title === "string" &&
      item.embedUrl === `https://www.youtube-nocookie.com/embed/${item.id}` &&
      item.sourceUrl === `https://www.youtube.com/watch?v=${item.id}`)) return;
    return value.items;
  } catch { /* A missing/corrupt cache is a miss, not a discovery failure. */ }
}

export async function writeVideoCache(key: string, items: MediaItem[]) {
  if (!enabled() || items.length !== 3) return;
  const dir = directory();
  const temporary = join(dir, `${randomUUID()}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(temporary, JSON.stringify({ at: Date.now(), items }), { mode: 0o600 });
    await rename(temporary, join(dir, filename(key)));
    const files = (await readdir(/* turbopackIgnore: true */ dir)).filter(name => /^[a-f0-9]{64}\.json$/.test(name));
    if (files.length > 256) {
      const ages = await Promise.all(files.map(async name => ({ name, at: (await stat(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, name))).mtimeMs })));
      await Promise.all(ages.sort((a, b) => b.at - a.at).slice(256).map(file => unlink(join(/* turbopackIgnore: true */ dir, file.name)).catch(() => {})));
    }
  } catch { await unlink(temporary).catch(() => {}); }
}

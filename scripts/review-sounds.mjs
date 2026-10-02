import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const catalog = require("emojibase-data/en/compact.json");
const base = process.env.REVIEW_BASE_URL || "http://127.0.0.1:3000";
const cases = [
  ["🌊", "Ocean"], ["😂", "Laughter"], ["☕", "Coffee"], ["✨", "Magic (supernatural)"],
  ["😴", "Sleep"], ["❤️", "Love"], ["❤️", "Human heart"], ["🤔", "Thought"],
  ["🪐", "Planetary ring"], ["🐙", "Octopus"], ["🐶", "Dog"], ["🐋", "Whale"],
  ["🎹", "Musical keyboard"], ["📚", "Book"], ["🔥", "Fire"], ["🇨🇴", "Flag of Colombia"],
];
const results = [];
const subjects = process.env.REVIEW_SUBJECTS?.split(",");
for (const [glyph, subject] of cases.filter(([, subject]) => !subjects || subjects.includes(subject))) {
  const emoji = catalog.find(item => item.unicode.replace(/\uFE0F/g, "") === glyph.replace(/\uFE0F/g, ""));
  const topic = { label: subject, query: subject, englishQuery: subject, language: "en" };
  const started = Date.now();
  const response = await fetch(`${base}/api/discover`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emojiId: emoji.hexcode, locale: "en", provider: "freesound", topic }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Discovery failed: ${response.status}`);
  const curated = await response.json();
  // Optional baseline comparison uses the old title-only retrieval. Credentials
  // stay in the environment; output contains public metadata, never request headers.
  let baseline;
  if (process.env.FREESOUND_API_KEY) {
    const url = new URL("https://freesound.org/apiv2/search/");
    for (const [key, value] of Object.entries({ query: subject, filter: 'license:("Creative Commons 0" OR "Attribution")', page_size: "10", fields: "id,name,url,license,previews,tags,duration" })) url.searchParams.set(key, value);
    const raw = await fetch(url, { headers: { Authorization: `Token ${process.env.FREESOUND_API_KEY}` }, signal: AbortSignal.timeout(10000) });
    if (raw.ok) baseline = (await raw.json()).results.filter(item => item.previews?.["preview-hq-mp3"]).slice(0, 3).map(item => ({ id: item.id, title: item.name, sourceUrl: item.url, tags: item.tags, durationSeconds: item.duration }));
    else baseline = { status: raw.status };
  }
  const result = { glyph, subject, durationMs: Date.now() - started, status: curated.status, partial: curated.partial, reason: curated.reason, baseline, items: curated.items };
  results.push(result);
  console.log(JSON.stringify({ glyph, subject, status: result.status, baseline: Array.isArray(baseline) ? baseline.map(item => item.title) : baseline, curated: result.items.map(item => ({ title: item.title, connection: item.soundConnection })) }));
  await new Promise(resolve => setTimeout(resolve, 700));
}
const output = process.env.REVIEW_OUTPUT || "/tmp/emoji-sound-review.json";
await writeFile(output, JSON.stringify(results, null, 2));
console.log(`Public sound metadata saved to ${output}`);

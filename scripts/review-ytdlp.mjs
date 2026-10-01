import { writeFile } from "node:fs/promises";

const base = process.env.REVIEW_BASE_URL || "http://127.0.0.1:3000";
const samples = [
  ["1F419", "Octopus", "Pulpo"], ["2764", "Love", "Amor"],
  ["1F3A8", "Painting", "Pintura"], ["1F3B5", "Music", "Música"], ["1FA90", "Space", "Espacio"],
];
const report = { at: new Date().toISOString(), base, results: [] };
async function search(input) {
  const start = performance.now();
  try {
    const response = await fetch(`${base}/api/discover`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input), signal: AbortSignal.timeout(31_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    return { durationMs: Math.round(performance.now() - start), ...result };
  } catch (error) { return { durationMs: Math.round(performance.now() - start), status: "error", message: error.message, items: [] }; }
}
// Run against a freshly started server with YOUTUBE_PROVIDER=yt-dlp. Serial
// samples avoid confusing queue contention with uncached search duration.
for (const [emojiId, english, spanish] of samples) {
  for (const locale of ["en", "es"]) {
    const label = locale === "en" ? english : spanish;
    const input = { emojiId, locale, provider: "youtube", topic: { label, query: label, englishQuery: english, language: locale } };
    const uncached = await search(input);
    const cached = uncached.status === "ready" || uncached.status === "empty" ? await search(input) : undefined;
    const sample = { subject: label, locale, uncached, cached };
    report.results.push(sample);
    await writeFile("/tmp/emoji-ytdlp-review.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ subject: label, locale, ms: uncached.durationMs, status: uncached.status, reason: uncached.reason,
      cachedMs: cached?.durationMs, videos: uncached.items.map(item => ({ title: item.title, creator: item.creator, sourceUrl: item.sourceUrl })) }));
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

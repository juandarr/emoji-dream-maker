# yt-dlp latency and selection review

Reviewed October 1, 2026 using the checksum-verified official yt-dlp 2026.08.19 Unix zip, Python 3, and the reusable worker pool. This supersedes the initial six-detail-extraction review (roughly 9–19 seconds and 0–3 matches).

## Final search measurements

`node scripts/review-ytdlp.mjs` requested octopus, love, painting, music and space in English and Spanish, serially. Each concept had a new selection-cache version and no persisted selection for that version. Requests retrieve and rank two 20-result public searches. No Data API fallback, cookies or media downloads were needed. Worker processes may already be initialized, as during normal app use. Timings include the local HTTP route; this is not a guarantee for first-process startup, network outages, YouTube throttling or simultaneous callers.

| Concept | Language | Uncached selection | Videos | Immediate repeat |
| --- | --- | ---: | ---: | ---: |
| Octopus | en | 1.564 s | 3 | 6 ms |
| Pulpo | es | 1.534 s | 3 | 6 ms |
| Love | en | 1.493 s | 3 | 7 ms |
| Amor | es | 1.279 s | 3 | 7 ms |
| Painting | en | 1.508 s | 3 | 10 ms |
| Pintura | es | 1.382 s | 3 | 5 ms |
| Music | en | 1.691 s | 3 | 6 ms |
| Música | es | 1.458 s | 3 | 5 ms |
| Space | en | 1.571 s | 3 | 6 ms |
| Espacio | es | 1.500 s | 3 | 6 ms |

All ten final samples returned three distinct lessons. Median uncached response was 1.504 seconds. Earlier optimization runs included requests around 2.2 seconds (and the standalone CLI around 2.4–3.9 seconds); the final sub-two-second sample is not a hard guarantee. Prefetch starts at emoji selection/dragging and the gallery renders videos independently of Wikipedia. Prepared results avoid this external request entirely.

A fresh production server loaded the persisted octopus selection in **70 ms**, then served its memory-cached repeat in **5 ms**. A new ocean concept including cold Python-worker startup returned three videos in **1.800 seconds**. Chromium displayed all three prepared octopus cards **110 ms** after opening the portal. The temporary production server was stopped after this check; the normal development server remains available.

Validation: **98 unit tests**, the **16-test browser suite**, the final targeted navigation regression, TypeScript checking, and a warning-free production build passed.

## Metadata relevance review

Selected IDs, titles and sources were reviewed for concept relevance. Octopus returned Real Science, TED-Ed, BBC Earth, National Geographic and DW. Love returned TED-Ed, AsapSCIENCE, CuriosaMente, DW and a philosophical explanation. Painting returned Great Art Explained and the National Gallery; Spanish painting included a practical oil-painting tutorial and explanations of painting/history. Music returned Big Think, TED-Ed, CuriosaMente, Lemnismath and BBC Mundo. Space returned CrashCourse, TED-Ed, National Geographic, Date un Vlog, QuantumFracture and CuriosaMente. Some Spanish search listings expose English titles; audio language is not reliably supplied by flat metadata.

Established sources are prioritized before weaker unfamiliar channels, including when a second lesson from the same educator is useful. Search-only candidates no longer need missing captions/like counts. Unknown channels still require topic/teaching evidence and at least 1,000 views. Explicit AI/spam/restriction signals remain exclusions. Public embedding permission is generally unknown until playback, and search metadata does not prove accuracy or detect undisclosed AI production. This is a metadata review, not a complete viewing of all thirty videos.

## Reproducibility and verification

Use a fresh empty `YOUTUBE_CACHE_DIR` and a freshly started app to benchmark without prior results; the report is written to `/tmp/emoji-ytdlp-review.json`. Three-video selections are saved for one hour in an ignored local directory, capped at 256 entries. Memory and browser caches also share concurrent requests. Worker initialization can be measured separately by restarting the server. The binary and archive are ignored and credentials are never written to reports.

Unit checks cover worker reuse, two-process limit, cancellation/replacement, split UTF-8, malformed/bounded output, credential isolation, provider fallback, stable concept keys, persisted/expired/corrupt caches and selection filters. Browser checks cover three cards within two seconds with delayed Wikipedia, prefetch reuse, same-concept navigation and popup autoplay/close controls. Live playback still depends on YouTube and browser autoplay policy.

For setup and configuration, see [README](../README.md). Sources: [official release](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19) and [yt-dlp documentation](https://github.com/yt-dlp/yt-dlp).

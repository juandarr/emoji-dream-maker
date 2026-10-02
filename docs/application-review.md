# Application review — October 1, 2026

Reviewed the explorer and bilingual catalog, saved discoveries, gallery navigation,
media viewers, all provider adapters and selectors, API boundaries, metadata/disk
caches, yt-dlp processes/workers, and the existing regression coverage.

## Fixes and loading improvements

| Area | Finding and change |
| --- | --- |
| Gallery startup | Art, GIFs and sounds previously waited up to five seconds for Wikipedia resolution. They now start with the local concept alongside video discovery. Enrichment reuses requests when the search terms are unchanged. |
| Development requests | Early requests could run twice during React Strict Mode's effect probe. Deferring startup by one microtask lets the cancelled probe exit without contacting providers. GIPHY remains uncached. |
| Wikipedia | Concurrent identical reads now share their work. Cancelling one reader preserves the others; cancelling a queued request returns promptly without breaking request serialization or rate-limit cooldowns. |
| Metropolitan Museum | Four detail requests now refill individually instead of waiting for each whole batch. Each object has a two-second deadline within the existing overall budget. Successful details survive other failures. |
| Cleveland Museum | Its parallel search and public-domain checks remain in place. The earlier gallery startup removes the Wikipedia delay for both museums. Empty normalized subjects no longer query whole collections. |
| GIPHY | Fixed-width WebP previews are used when available and smaller according to supplied sizes (or sizes are absent). The original GIF remains a playback fallback. Thumbnails decode asynchronously. |
| YouTube Data API | A failed search pool no longer discards verified lessons from the successful pool. Incomplete final selections are not retained in the server's hour-long selection cache, so reopening/retrying can recover the failed pool. Successful raw metadata is still reused. |
| yt-dlp | English fallback results are retained when both Spanish searches fail. Ranking ties follow query order instead of network completion order. Persistent selections distinguish the configured Python archive. |
| Playback | A queued Space shortcut survives iframe initialization. Durations no longer display fractional seconds. Starting a sound pauses other sounds; failed previews and partial sound searches expose retry controls. Audio still uses `preload="none"`. |
| Client startup/search | Gallery code loads on demand and warms when selecting an emoji. Catalog normalization and browse ordering are reused across searches instead of recomputed on every query. |
| Request sizes | Incoming discovery requests and server provider responses are bounded while streaming, using bytes rather than string length. Oversized chunked bodies are cancelled before fully buffering them. |
| Saved topics | Optional descriptions, suggested flags, article titles and page IDs are validated before use, preventing malformed saved data from reaching React rendering. Correction queries are trimmed. |
| Test reliability | Two outdated relevance fixtures were corrected. Playwright now owns a dedicated server rather than silently reusing a different app on port 3000. GIF tests run with a dummy key and intercepted requests. |

Museum endpoints were checked against the [Met API documentation](https://metmuseum.github.io/)
and [Cleveland API documentation](https://openaccess-api.clevelandart.org/).
The existing Met `v1.1/search` endpoint is retained. Freesound's search endpoint
matches its [current resource documentation](https://freesound.org/docs/api/resources_apiv2.html).
GIPHY's [rendition documentation](https://developers.giphy.com/docs/optional-settings/)
supports fixed-size WebP previews; the app retains its existing relevance selection.

## Verification

- All 149 unit/integration tests passed and cover selectors, both YouTube transports, worker/process
  lifecycle, API validation, partial-source recovery, caches, cancellation, storage,
  and bounded streams.
- All 28 Chromium browser tests passed and cover drag/drop, keyboard controls, search, favorites,
  history, English/Spanish, phone layouts, focus restoration, navigation, image
  zoom/panning/fallback, audio coordination, video controls, and independent loading.
- `npm run typecheck` and `npm run build` both passed with the final source changes.
- A production server smoke test returned HTTP 200 for the app and HTTP 400 for
  malformed discovery input. Missing optional integrations returned structured
  `setup`/`credentials` states rather than crashing.

One live production sample for **Octopus**, measured from local HTTP requests:

| Provider | First metadata response | Immediate cached repeat | Result |
| --- | ---: | ---: | --- |
| Art (both museums) | 1,659 ms | 38 ms | Five artworks, no partial-source flag |
| Wikipedia | 705 ms | 11 ms | One article summary |

Sample preview URLs from both museums returned HTTP 200 with JPEG content types.
These are a single local sample, not a before/after benchmark or a guarantee for
other subjects, connections, quotas, or full-resolution image downloads.

The checkout has no real YouTube API, Freesound or GIPHY credentials and no local
yt-dlp setup. Authenticated provider retrieval and real YouTube/audio playback
therefore remain covered by controlled responses, not a live authenticated audit.
The existing GIPHY production-policy limitation documented in README remains;
this review does not change provider approvals or relevance guarantees.

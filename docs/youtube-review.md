# YouTube selection and playback

Updated October 1, 2026.

## Selection

The yt-dlp provider requests two educational searches of up to 20 results each. The second query uses domain context for painting and space; sparse Spanish pools can be supplemented with English lessons about the same concept. IDs are deduplicated and three relevant lessons are selected, preferring different educational channels. The Data API provider retains its two 25-result searches and batched details lookup.

To meet the latency target, yt-dlp ranks flat search metadata directly instead of fetching six individual watch pages. Titles, channel identities, duration and views are available there. Missing embedding permission, captions and likes remain unknown and no longer cause rejection. Explicit restrictions still reject a candidate. The Data API continues enforcing confirmed public/embeddable status, captions and engagement rules where its richer metadata is available. Neither metadata approach proves factual accuracy or detects all undisclosed synthetic footage.

Both paths retain topic relevance, 90-second to 90-minute duration, educator preference by channel ID, learning intent, textual AI screening and spam exclusions. Known educators can establish learning intent without formulaic title wording. Unfamiliar search channels require a teaching title and at least 1,000 views. Unrelated songs, game footage, movie recaps, recipes and incidental uses of “love” are filtered. Natural subject variants such as musical/música and universe/space improve recall. Known educational channel IDs were checked through the API or official search metadata; copied display names receive no preference.

Selection/dragging prefetches videos. Opening the gallery subscribes to that work and shows cards without waiting for Wikipedia resolution. Wikipedia enrichment of the same concept does not reload the cards. Client and server caches share identical work and isolate cancellation between subscribers. Three-video selections persist locally for one hour across restarts, capped at 256 files. Search metadata is cached in memory for one hour. Missing/corrupt disk entries are cache misses; errors do not become successful cached results.

The optional Python worker pool imports the verified official Unix yt-dlp zip once per process, reusing at most two workers. Requests are JSON over stdin with no shell, user configuration, account cookies or media downloads. Cancellation kills the active worker; queued cancellations leave other requests intact. Output is bounded. Workers expire after five idle minutes. The CLI path remains available without Python worker configuration. Eight seconds bound local discovery, eight more bound optional API fallback, and the server/browser deadlines are 17/18 seconds. Video prefetch bounds its shared fetch to 17.5 seconds. These ceilings handle failures; actual timings are recorded separately.

`auto` uses the API only after an operational yt-dlp failure and only with an API key. Honest empty results do not spend API quota. A source outage or genuinely sparse concept can still prevent three suitable results; rejected or duplicate videos are never used to fill slots.

## Player

The native modal dialog appears above the gallery, with a responsive 16:9 player, video title, creator, close icon, and YouTube source link. The iframe is created only after the user's click, with `autoplay=1`, `playsinline=1`, and the iframe's autoplay permission. Closing the icon, outside-clicking, or Escape destroys the iframe and restores focus to the card. The gallery remains open, and audio previews pause when a video starts. The gallery's own keyboard handler defers to the video dialog while it is open.

## Verification

Unit checks cover relevance and learning signals, synthetic/spam filtering, performance and recipe homonyms, compound and Spanish subjects, playback restrictions, engagement and caption requirements, source identity, diversity, duplicate IDs, missing videos, cache behavior, and failed metadata lookups. Browser checks exercise popup sizing on desktop, laptop, and phone; autoplay configuration; focus containment and restoration; each close method; audio pause; and iframe cleanup.

Live searches were sampled in English and Spanish for octopuses, love, painting, and musical notes. The final source preference surfaced educational publishers including Real Science, TED-Ed, Big Think, Art History School, Lemnismath, and QuantumFracture. Earlier live samples exposed irrelevant Beatles lessons, recipes, song covers, and sensational mystery titles; those patterns now have exclusion checks. These samples establish metadata selection behavior, not a full editorial review of every video.

A real octopus video from Real Science was opened in Chromium: the embedded video existed, its `paused` property was `false`, and no player error appeared after the first click. Desktop and phone layouts were visually inspected. Browser restrictions, connectivity, and future YouTube availability can still affect playback.

References: [YouTube search parameters](https://developers.google.com/youtube/v3/docs/search/list), [video metadata](https://developers.google.com/youtube/v3/docs/videos), and [embedded player parameters](https://developers.google.com/youtube/player_parameters).

## yt-dlp verification

See [the current local search review](ytdlp-review.md) for the separate English and Spanish benchmark. Tests cover anonymous operation, optional fallback, cancellation, shared requests, subprocess/output limits, malformed metadata, missing executables, restrictions, cache expiry, and honest empty results. No test downloads provider media.

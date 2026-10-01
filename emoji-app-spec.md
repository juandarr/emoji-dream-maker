# Emoji Dream Maker — Build Specification

## 1. Summary and chosen direction

Build a personal, desktop-first web app where users search for emojis, explore them in a square constellation, and drag one into a glowing portal. The portal opens a dream gallery containing related videos, GIFs, sounds, artworks, and Wikipedia context.

**Confirmed choices:** cosmic visual style; English and Spanish; keyword search initially; live lookup across the emoji catalog; one emoji per reveal; literal meanings first, with alternatives; favorites and history saved locally.

**MVP boundary:** no accounts, generated media, emoji combinations, or public-launch infrastructure. Jev remains a future experiment. Start locally; hosting is a later step.

## 2. Experience and emoji classification

### Main interaction

1. Open a dark square canvas with a search bar above it, category filters, and a glowing portal at its center.
2. Type a keyword in either language. Matching emojis appear in clusters according to their standard categories.
3. Hover or focus an emoji to see its localized name. Dragging highlights the portal and pauses nearby motion.
4. Drop it into the portal. A short absorption animation opens the gallery immediately, with loading placeholders.
5. Read Wikipedia context and explore separate Watch, GIFs, Listen, and Art sections.
6. Choose another interpretation, favorite the subject, or close the gallery and continue exploring.

Example: `octopus` and `pulpo` surface 🐙. Dropping it opens octopus-related media and a short Wikipedia introduction.

### Canvas behavior

- Render emojis as accessible HTML buttons positioned inside a square container.
- Show up to 48 results per page, with a visible count and pagination.
- Use deterministic starting category sectors on three concentric orbital lanes. Emojis travel around the black hole at different speeds and remain upright; keep the drop area clear.
- Double glyph size on hover or keyboard focus without a background tile. Keep that enlarged size throughout dragging. Pause orbital motion while hovering, focusing an emoji, dragging, and while the gallery is open; resume when picking ends.
- Render the black hole as a small web-native vector with a dark horizon, a bright golden accretion disk, curved light, and gradual shimmer inspired by Interstellar.
- Provide constellation, grid, and list views, reduced-motion support, and a click-to-select Open portal action.
- On phones, stack the interface and support tapping instead of requiring dragging.

### Classification and search

Use [Emojibase localized datasets](https://emojibase.dev/docs/datasets/) for stable Unicode identifiers, English and Spanish labels, keywords, categories, and variants. Keep standard emoji classification separate from the subject interpretation used to retrieve media.

Search locally against both language indexes. Normalize case and accents, then rank exact labels, exact keywords, prefixes, and partial word matches. Preserve stable ordering for ties. Empty search shows a balanced category selection; no matches shows example searches.

Group skin-tone variants under their base emoji with a variant selector; preserve full Unicode sequences. Keep an editable alias file for missing synonyms and landmark associations, labeling associations separately from the emoji's actual meaning.

### Choosing a subject

Start with the standard meaning and search Wikipedia using its localized label. Display the chosen article title prominently. Offer up to three alternatives and a Change subject search. If no article matches confidently, retain the emoji label as the media query and show unavailable context. Do not present cultural or symbolic associations as universal definitions.

## 3. Architecture and interfaces

### Stack and data flow

Next.js, React, TypeScript, CSS, Motion, and dnd-kit implement the interface and server endpoints. Vitest and Playwright verify logic and interactions. Browser local storage retains preferences, favorites, and history. A bounded in-memory cache stores permitted metadata; no database is required.

`Search → emoji selection → subject resolution → parallel provider lookups → progressive gallery`

Search never contacts media providers. Opening the portal initiates discovery; sections load independently.

| Type | Required information |
| --- | --- |
| EmojiRecord | Unicode identifier, glyph, localized labels/keywords, category, variants |
| TopicCandidate | Subject label, language, provider queries, optional Wikipedia page identifier/title |
| MediaItem | Provider ID, title, source and preview/embed URLs, attribution and rights metadata |
| ProviderResult | Status, items, and a user-readable unavailable explanation |

Provider statuses: loading, ready, empty, unavailable, error.

### Backend interfaces

- `GET /api/resolve?emojiId&locale` returns a default subject and alternatives. Optional bounded `q` supports Change subject.
- `POST /api/discover` accepts emoji identifier, selected subject, language, and provider: Wikipedia, YouTube, Freesound, or Art Institute; returns one independent provider result.
- GIPHY search runs directly in the browser through its adapter.

Validate identifiers, language, provider, and subject length. Use fixed provider endpoints and no arbitrary fetch URLs. Keep private credentials server-side; GIPHY uses its designated public browser integration key.

Favorites store emoji and subject identifiers, not media. Retain the last 50 discoveries and up to 200 favorites. Reopening performs fresh lookups. Provide clear-history and clear-favorites controls.

## 4. Media sources and reliability

| Content | Implementation |
| --- | --- |
| Wikipedia | [MediaWiki REST API](https://www.mediawiki.org/wiki/API:REST_API/Reference/en) search and HTML/metadata. Extract 2–4 opening prose sentences, capped at 150 words, labeled Wikipedia excerpt; include article, revision, and license links. |
| Videos | [YouTube](https://developers.google.com/youtube/v3/docs/search/list): video-only, embeddable, strict safe search; three results; player loads on click. |
| GIFs | [GIPHY](https://developers.giphy.com/docs/api/): rating g; six results in returned order, dedicated section and required attribution; direct provider URLs, no proxy/persistence. |
| Sounds | [Freesound](https://freesound.org/docs/api/overview.html): three CC0/CC BY previews; creator/license displayed; click to play. |
| Art | [Art Institute of Chicago](https://api.artic.edu/docs/): three public-domain works with images; title, artist, date, source; identify paintings where supported. |

Search emojis in both languages regardless of interface locale. Wikipedia uses the selected language with a visibly labeled English fallback when needed. Use localized queries for Wikipedia, YouTube, and GIPHY, and English labels for sound/art. Original media titles are preserved.

### Failure handling

- Open the gallery before requests finish. Subject resolution has a five-second deadline with standard-label fallback.
- Each media lookup has an eight-second deadline; display successful sections immediately.
- Distinguish empty responses, unavailable keys, quota exhaustion, and temporary errors; retry only the affected section.
- Cancel obsolete requests when changing subjects or closing.
- Offer source links for failed embeds. Never autoplay audio/video; closing stops playback.
- Cache permitted metadata for at most one hour; exclude GIPHY from application caching.
- Every catalog emoji supports lookup; individual media types may be empty. Never substitute unrelated content.
- Record local provider timings/failures without logging raw queries. Missing keys disable only affected sources.

### Jev's future role

[Jev](https://docs.typesafe.ai/introduction/quickstart) could classify themes or judge relevance, but is unnecessary for keyword search. A later experiment compares keyword retrieval with Jev-assisted decisions on bilingual queries. Preserve standard categories and keyword fallback; Jev judges defined candidates rather than inventing subjects or writing summaries.

## 5. Delivery and acceptance tests

Build interaction foundation; then subject/context; then live provider adapters; then persistence, responsive polish, and verification. Include this specification and a setup guide for credentials and local startup.

- Octopus/pulpo and accented/unaccented Spanish match consistently.
- Flags, compound Unicode sequences, categories, and variants remain intact; variants share base subjects.
- Dragging and keyboard alternatives open equivalent galleries.
- Heart offers love as a sensible default and an anatomical-heart alternative.
- Rapid subject changes cannot show stale results.
- Timeout, missing key, empty response, and quota errors leave other sections usable.
- Wikipedia excerpts exclude navigation/table text and retain attribution.
- GIPHY ordering/attribution and sound/art rights metadata are preserved.
- Playback requires an action and stops when closing.
- Persistence survives reload; corrupt/unavailable storage cannot crash the app.
- Reduced motion disables orbits and continuous black-hole shimmer and simplifies reveals. Hover/focus enlargement remains available.
- Search updates within 100 ms after a 150 ms debounce on typical desktops; gallery shell opens immediately.
- Review at least 20 subjects across emotions, activities, objects, places, animals, and abstract symbols. Document poor mappings and improve aliases without fabricating media coverage.

**Success:** search, discover an emoji, open its multimedia gallery, correct its interpretation, and revisit a favorite without an account.


## Wikipedia exploration update — October 2026

- Use editable bilingual concept mappings for descriptive emoji names, keeping Unicode labels unchanged. Resolve redirects before searching; offer ambiguous results for explicit selection.
- Fetch plain-text Wikipedia introductions with Action API TextExtracts, retaining article/revision/license links. Keep REST HTML as a fallback.
- Show a dedicated readable context panel followed by up to six related entries drawn from actual introduction and See also links. Verify destination pages and exclude disambiguation pages.
- Selecting a related entry refreshes all media. Maintain a bounded 20-step back trail and preserve cancellation when navigating.
- Keep related-entry requests independent of the summary. Missing articles, network failures, and rate limits have actionable correction, source links, and retry states.
- Identify the server using a real authorized public contact in WIKIMEDIA_USER_AGENT. Respect Retry-After, serialize uncached requests, and reuse cached introductions.

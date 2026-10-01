# Dream Maker

A personal emoji explorer: bilingual keyword search, a cosmic constellation, and a drag-and-drop portal into live media and Wikipedia context. The agreed specification is in [emoji-app-spec.md](emoji-app-spec.md).

## Start locally

Requires Node.js 20.19+ (Node 24 recommended).

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The server binds to your local computer. Wikipedia and public-domain artworks require no API keys. Use any provider keys you already have; the app remains usable with unavailable-source messages when optional sources are not connected.

## Connect optional media sources

- **YouTube:** enable YouTube Data API v3 in a Google Cloud project and set `YOUTUBE_API_KEY`. Restrict the key to that API. [Setup](https://developers.google.com/youtube/v3/getting-started).
- **Freesound:** request an API credential and set `FREESOUND_API_KEY`. This app uses token-authenticated search and previews, not user OAuth or downloads. [Authentication](https://freesound.org/docs/api/authentication.html).
- **GIPHY:** create a browser integration key and set `NEXT_PUBLIC_GIPHY_API_KEY`. This key is intentionally public; searches and GIF media load directly in the browser. Follow the provider's beta/production requirements. [Documentation](https://developers.giphy.com/docs/api/).
- **Wikimedia:** set `WIKIMEDIA_USER_AGENT="EmojiDreamMaker/0.2 (mailto:YOUR_REAL_PUBLIC_EMAIL)"`, replacing the placeholder with your real public contact (a project contact URL also works). This value is sent only by the server to Wikimedia. In 2026, unidentified requests have a much lower allowance than clients with a compliant identification header. See [Wikimedia rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits). The app respects `Retry-After` and shows a retry countdown.

Restart the server after changing environment values. Never put private keys in variables beginning with `NEXT_PUBLIC_`. The app does not scrape YouTube or download provider media. Quotas and approvals remain provider-specific.

## Use the explorer

Search in English or Spanish, choose a category, and select an emoji. Drag it into the portal or press Enter to select it and use Open portal. Space and arrow keys also support keyboard dragging. Grid and list views are available. Variants share the base emoji's subject.

In the constellation, emojis orbit the glowing black hole in three lanes while staying upright. Hovering or keyboard-focusing a glyph doubles its size and pauses the orbits for easier picking. Motion also pauses during dragging and an open gallery. Reduced motion retains a static constellation and black hole. The golden accretion disk is a lightweight inline vector with gradual CSS shimmer.

The gallery loads each source independently. You can choose an alternative interpretation, search for another subject, retry an individual section, or save a favorite. Closing it stops audio and embedded video. Spanish Wikipedia falls back visibly to English when no matching Spanish entry is available.

YouTube combines two searches (explanations and documentaries, up to 50 candidates) and checks full video metadata before selecting up to three educational matches. Established educators and institutions are preferred by channel ID, with additional caption and engagement requirements for other channels. Obvious synthetic-content disclosures, spam, unsuitable playback, and unrelated song, game, movie, or recipe matches are filtered out. Fewer results appear when fewer qualify; metadata screening cannot guarantee factual accuracy or detect all undisclosed AI content. Searches and metadata share the one-hour cache. See [the YouTube review](docs/youtube-review.md) for selection rules and verification.

Click a video preview to open the centered, larger player with autoplay. The close icon, clicking outside, or Escape closes the player and stops playback while preserving the discovery. Opening a video pauses any audio preview. The player fits desktop, laptop, and phone screens and returns keyboard focus to the selected card when closed.

Favorites, the last 50 journeys, language, view, and motion preferences stay in this browser only. Reopening a discovery retrieves fresh results. No account, database, or app analytics service is used. Media providers receive the subject queries and normal web requests required to retrieve/play their content. Typography uses Google Fonts with system-font fallback.

## Verify and build

Version snapshots describe a specific tagged commit, including feature status, interface, services, verification, and limitations. See the [v0.1.0 snapshot](docs/releases/v0.1.0.md) and use the [release snapshot template](docs/releases/TEMPLATE.md) for future versions. The matching GitHub Release is attached to the `v0.1.0` tag.

```sh
npm run test
npm run typecheck
npx playwright install chromium
npm run test:e2e
npm run build
npm start
```

Browser tests use isolated test responses to reliably exercise errors and cancellation; they do not claim real media coverage. See [docs/content-review.md](docs/content-review.md) for the separate source review.

## Wikipedia exploration

The **Understand & explore** panel names the selected concept, shows up to four opening sentences (150 words), and links to the full article, revision, and license. These are Wikipedia excerpts, not generated explanations. **Keep exploring** shows up to six verified article links from the introduction and “See also” section, with short descriptions. Opening a connection refreshes the summary and media; **Back to** retraces up to 20 steps. Missing entries offer concept correction and direct Wikipedia search. A related-link failure never removes a successful summary.

Emoji names such as “smiling face with smiling eyes” map to editable starting concepts such as “Smile.” See `src/lib/concepts.ts` and `src/lib/aliases.ts`. These associations do not change Unicode labels or claim that symbols have one universal meaning.

The Wikipedia adapter in `src/lib/wikipedia.ts` first uses [TextExtracts](https://www.mediawiki.org/wiki/Extension:TextExtracts) with redirects and English language links in a single request. Successful metadata is cached for an hour (256 entries), including the initial summary. REST HTML is a fallback for summary failures and the source of contextual links; Action API parse provides a second HTML route. Uncached calls are serialized and spaced, and rate-limit responses stop further requests until Wikimedia’s requested wait has elapsed. No search text is logged. The setup still depends on Wikimedia availability and a valid contact header.

Run `node scripts/review-wikipedia.mjs` against the local server for a separate 22-subject live review. Its temporary report is written to `/tmp/emoji-wikipedia-review.json`; the reviewed findings are in `docs/wikipedia-review.md`.

## Maintain

Update search/subject associations in `src/lib/aliases.ts`. Standard categories and translations come from the pinned Emojibase package. Provider adapters live in `src/lib/providers.ts`; GIPHY remains separate in `src/lib/giphy.ts` and is never cached or proxied. Permitted server metadata is cached for one hour with a 256-entry cap.

This is a personal local MVP. Live relevance varies, and empty results are honest. Public deployment, accounts, generated media, combinations, and Jev-assisted search are future work. No deployment is performed by this project.

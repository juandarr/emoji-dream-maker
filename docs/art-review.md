# Visual gallery and museum image retrieval

Updated October 1, 2026.

The gallery uses the [Cleveland Museum of Art Open Access API](https://openaccess-api.clevelandart.org/) and [The Met Collection API](https://metmuseum.github.io/). Both supply images alongside collection metadata without API credentials. Chicago's previous IIIF host returned HTTP 403 anti-bot challenges in this environment; its public API still worked, so successful metadata alone was not evidence of a usable preview. The museum's repository has a [report of the same image delivery issue](https://github.com/art-institute-of-chicago/data-aggregator/issues/151). The updated gallery uses the verified direct Cleveland and Met image hosts.

## Retrieval and selection

`src/lib/art.ts` queries both museums independently and combines their candidates. Cleveland supplies up to 36 candidates per query, with CC0 and image filters, followed by verification of rights, direct HTTPS museum hosts, and a preview dimension of at least 600 pixels on its longest side. Its web JPEG is used in cards and print JPEG in the viewer. TIFF originals are not used.

The Met uses the current paginated `/v1.1/search` endpoint, because `/v1/search` was retired on October 1, 2026. Each query requests 12 IDs with `hasImages=true`. Up to 24 unique IDs are interleaved across queries and hydrated from `/v1/objects/{id}`, with at most four concurrent detail requests. Items must have verified public-domain status and a direct Met image. Cards use `primaryImageSmall` where supplied; opening the viewer requests `primaryImage`.

A selected English concept produces at most three queries. Editorial visual associations improve literal and emotional searches: love includes lovers and Cupid; musical notes include music, musicians and instruments; crescent maps to moon scenes. Spanish discoveries use the resolved English article title for museum search. A changed concept builds a fresh plan rather than retaining the original emoji's associations. Generic disambiguators are removed, but meaningful qualifiers such as “Bass (fish)” are retained.

The selector ranks full-word and full-phrase evidence in titles, then subject tags, then museum descriptions with depiction-related wording. Creator names are not relevance evidence. Precise heart and brain concepts require title or subject evidence, rather than incidental descriptions of another object. Reviewed Fox River and papal-medal homonyms are excluded. Paintings get a bounded preference; repeated artists, series and collections receive bounded diversity penalties. Duplicate IDs, images and title/creator/date identities are removed. At most five qualifying images are shown, without padding.

Successful metadata uses the existing bounded one-hour cache. The museums share a 6.5-second retrieval budget within the discovery endpoint's 7.8-second deadline. Partial search/detail failures preserve verified responses and expose a localized retry notice. Full failures retain the provider error state. Empty searches and incomplete retrievals are distinguishable.

## Gallery and viewer

The visual gallery follows the context panel, ahead of videos and sounds. A museum-wall layout gives the first two results more space, followed by three smaller cards; phones feature the first result and then a two-column grid. Images use `object-fit: contain` to preserve the entire artwork. Each card includes its match term, collection, creator, date, license and museum shortcut. All new interface text is available in English and Spanish.

The native modal viewer provides a larger image, source and license links, next/previous buttons, arrow-key navigation, and 2× zoom with scrolling. It pauses other gallery audio when opened. High-resolution failure falls back to the card image; unavailable images show an explicit state rather than an unexplained icon. Escape, close and backdrop dismissal restore focus to the originating card and preserve the gallery. The parent gallery's key handler defers while the nested dialog is open.

## Verification

Unit coverage includes concept expansion, phrase boundaries, unrelated creator metadata, known homonyms, precise anatomy, painting preference, diversity, duplicates, five-image limits, source host/rights/resolution verification, partial responses, and cache reuse. Browser coverage includes five visible cards, rendered previews, large-image fallback, viewer navigation, zoom, focus containment/restoration, all dismissal methods, changed concepts, retries and Spanish phone layout. The existing discovery and video tests also passed.

Live API samples returned matching results for octopus, love (Spanish “Amor”), musical notes, and crescent/moon concepts. A changed anatomical-heart concept returned an empty list rather than the unrelated sacrificial basin from an earlier sample. Several Met queries or detail responses were temporarily unavailable; partial retrieval preserved the available artworks. Metadata ranking is a relevance heuristic and cannot guarantee the visual content of every work. Museum collections may have fewer than five close matches, especially for contemporary objects or precise anatomy.

Real Cleveland and Met images were rendered in Chromium: all five live love previews and all five mixed-source music previews loaded. Larger images were checked on desktop and phone. The phone viewer had no horizontal overflow. Screenshots are in `docs/art-review/`. Run `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 node scripts/review-art.mjs` against a development server for a live visual review; an optional first argument accepts saved museum discovery responses for reproducible layout checks without repeating API requests.

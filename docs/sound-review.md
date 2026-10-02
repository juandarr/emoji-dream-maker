# Sound curation review

Reviewed October 1, 2026, using the user's existing Freesound credential. No additional provider, generated audio, or new dependency was added.

## Method

`scripts/review-sounds.mjs` compares the previous title-only query and first-three selection with the application's scene-based discovery. The production-preview batch covered 16 selected subjects: Ocean, Laughter, Coffee, Magic, Sleep, Love, Human heart, Thought, Planetary ring, Octopus, Dog, Whale, Musical keyboard, Book, Fire, and Flag of Colombia. All 16 returned ready results with three attributed previews in that run. The heart cases use the same emoji and different selected subjects.

This was a review of public titles, tags, descriptions, attribution and search behavior, not an audio audition or a benchmark of perceived sound quality. The exact results depend on Freesound's catalogue and ranking. The script takes selected subjects directly; it does not measure Wikipedia resolution accuracy or coverage of every emoji.

## Observed changes

| Subject | Previous examples | Curated scenes |
| --- | --- | --- |
| Ocean | CreekByOcean; ocean-3; ocean-1 | Breaking ocean waves and underwater ambience, with varied creators |
| Laughter | Anxious Evil Laughter; Taunting Evil Laughter; Ghostly Evil Laughter | Human laughter; evil/taunting interpretations are excluded |
| Coffee | Coffee machine, pouring, grinding | Espresso machine, coffee pouring and an explicitly evocative café atmosphere |
| Magic | Vampire Awakening; Crystal Magic; ethereal noise | Sparkles, magical chimes and shimmer, marked as associations |
| Sleep | Three recordings named Sleep Study | Snoring and sleeping breathing; the nighttime association was narrowed to crickets after a busy-bar match appeared |
| Love | Spoken love declaration; New life; Unrequited Love | Kissing and romantic piano, marked as associations |
| Human heart | Heart and stethoscope recordings | Heartbeat recordings; the Love interpretation does not leak into this subject |
| Thought | Quotes and spoken phrases | Ticking clocks and soft piano, marked as associations |
| Planetary ring | Tibetan bells and tubular chimes | Imagined space atmospheres and science-fiction drones, marked as associations |
| Octopus | YellowOctopus; cellophane-covered bathtub; octopus tentacles | Underwater scenes, explicitly evocative rather than claims of octopus vocalizations |
| Dog | Scratching a door and running on floors | Barking, panting and whining |
| Whale | Watching whale-watchers; KraftWhale | Whale-song candidates; disclosed synthesizers and a manipulated dog imitation are excluded |
| Musical keyboard | Musical thinking; musical hopeful; isolated Eb1 note | Piano notes and phrases |
| Book | Two identically named page recordings; dragging a book | Page turns and book-page handling; paper bags are excluded |
| Fire | Generic effects, fire recordings | Crackling fire recordings |
| Flag of Colombia | No results | Flapping flags, marked as a shared association without asserting Colombian location or national music |

## Selection and reliability

- Up to three focused queries, 30 candidates per query, relevance ordering and grouping by sound pack. Returned metadata supports ranking without extra per-sound lookups.
- Complete-word matching in names/tags; specific recording descriptions can supply weaker evidence. Ratings and downloads only affect close relevance ties.
- Up to three results, never filled with unrelated candidates. IDs, identical audio hashes/preview URLs and numbered variations from the same creator are deduplicated; repeated scenes, creators and packs receive a diversity penalty.
- CC0/CC BY only, creator and source attribution, an HTTPS HQ preview and a duration between 0.3 and 180 seconds. Unknown subjects retain a precise query and disambiguating qualifiers.
- English retrieval with English/Spanish connection labels. Silent or abstract concepts use explicit editorial associations. Audio stays click-to-play and closes with the gallery.
- Existing one-hour bounded metadata cache and shared-request cancellation. Each query has a 5.5-second deadline within the gallery deadline; successful scenes survive individual failures and the gallery indicates incomplete searches. An abandoned discovery cancels its requests.

## Verification

127 unit tests passed, including search boundaries, rights, duplicates, scene failures/deadlines, cancellation, disambiguation, and the misleading matches found during review. Four relevant browser tests passed against the production server: subject-change cancellation, playback/cleanup, English connections, and Spanish connections at phone width. TypeScript validation and the production build passed. The last sleep-scene refinement also passed the 20 focused sound tests.

Metadata can be incomplete, inaccurate, or omit sound-design provenance. No candidate is treated as acoustically verified. New editorial associations should be checked by listening to their previews, and uncommon subjects may legitimately return fewer results or none.

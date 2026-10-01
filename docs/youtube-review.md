# YouTube selection and playback

Updated October 1, 2026.

## Selection

The adapter searches for explanations and documentaries using two independent, localized queries. Each returns up to 25 candidates; duplicate video IDs are removed. One batched `videos.list` request verifies the candidates' complete metadata, then the selector returns at most three videos. Successful API responses use the existing one-hour metadata cache. Each uncached discovery uses two search requests and, when candidates exist, one metadata request.

Candidates must be public, embeddable, processed videos between 90 seconds and 90 minutes. Livestreams, age restrictions, geographically restricted videos, synthetic-content disclosures, and obvious spam are excluded. Titles must match the selected subject or an article-language equivalent. Established educational sources can also establish relevance through their opening description. Incidental uses of “love” as a verb are screened separately. Unrelated performances, game footage, movie recaps, and recipes are excluded while instructional music videos remain eligible for music subjects.

The preference list in `src/lib/youtube-channels.ts` identifies educators, science organizations, museums, and educational publishers by public channel ID. IDs were checked with YouTube's `channels.list` endpoint, so copying an educator's display name does not receive that preference. Even preferred channels must meet relevance, learning, and playback requirements. Other channels also need learning intent in the title, captions, at least 1,000 views and 10 likes, and a likes/views ratio of at least 0.5%. These are confidence signals, not proof of quality. Topic relevance, learning intent, source identity, appropriate length, language, HD availability, and captions determine ranking; popularity contributes only a small bounded bonus. Different channels are preferred when suitable alternatives exist.

The list is never padded with rejected candidates. Automated metadata screening cannot guarantee accuracy, evaluate every video's footage, or identify all undisclosed AI production. The preference list can be expanded as useful teachers are reviewed. Older standard-definition lessons remain eligible rather than being rejected solely for resolution.

## Player

The native modal dialog appears above the gallery, with a responsive 16:9 player, video title, creator, close icon, and YouTube source link. The iframe is created only after the user's click, with `autoplay=1`, `playsinline=1`, and the iframe's autoplay permission. Closing the icon, outside-clicking, or Escape destroys the iframe and restores focus to the card. The gallery remains open, and audio previews pause when a video starts. The gallery's own keyboard handler defers to the video dialog while it is open.

## Verification

Unit checks cover relevance and learning signals, synthetic/spam filtering, performance and recipe homonyms, compound and Spanish subjects, playback restrictions, engagement and caption requirements, source identity, diversity, duplicate IDs, missing videos, cache behavior, and failed metadata lookups. Browser checks exercise popup sizing on desktop, laptop, and phone; autoplay configuration; focus containment and restoration; each close method; audio pause; and iframe cleanup.

Live searches were sampled in English and Spanish for octopuses, love, painting, and musical notes. The final source preference surfaced educational publishers including Real Science, TED-Ed, Big Think, Art History School, Lemnismath, and QuantumFracture. Earlier live samples exposed irrelevant Beatles lessons, recipes, song covers, and sensational mystery titles; those patterns now have exclusion checks. These samples establish metadata selection behavior, not a full editorial review of every video.

A real octopus video from Real Science was opened in Chromium: the embedded video existed, its `paused` property was `false`, and no player error appeared after the first click. Desktop and phone layouts were visually inspected. Browser restrictions, connectivity, and future YouTube availability can still affect playback.

References: [YouTube search parameters](https://developers.google.com/youtube/v3/docs/search/list), [video metadata](https://developers.google.com/youtube/v3/docs/videos), and [embedded player parameters](https://developers.google.com/youtube/player_parameters).

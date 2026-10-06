# English / Spanish interface review

Reviewed the application route, the missing-page recovery screen, and all its views: Discover (constellation, grid, list), Favorites, History, Playground / Espacio creativo, the discovery gallery, subject search, Wikipedia context and related concepts, museum gallery and image viewer, learning videos and video dialog, GIFs, sound cards, creative context and relationship editor, generation settings and summary, board file menu, emoji picker and filters, canvas actions and transformation handles, layers and stacking menu, fullscreen, generation results, saved creations, reading dialog, and output editing.

## Implemented

- Translated the Spanish workspace name and its entry points to **Espacio creativo**. Replaced untranslated “prompt” and the awkward “curados” wording. Clarified picker, resize, fit, and empty-state instructions in both languages. Kept the creative “Make a” label and used the requested Spanish wording “Crear un(a)”.
- Localized generation failures using stable error codes, including provider credentials, credits, permissions, limits, unavailable models, reasoning settings, completion budgets, malformed output, and uncertain outcomes. Saved failures remain translatable after a language switch or reload. Legacy failures without a code get a localized general message.
- Translated result token usage and formatted counts, dates, and USD costs in the selected language. Corrected singular result counts and picker pagination wording.
- Made catalog labels, variants, and automatic symbol meanings follow the interface language. Custom meanings, scene titles, notes, relationships, and saved creations retain authored text. Exported boards preserve explicitly edited meanings. Unknown imported symbols retain their labels. Legacy boards infer automatic meanings by matching existing catalog defaults; newly edited meanings are explicitly marked as authored.
- Corrected a language-selection race before client initialization and localized the browser title for the current view. Replaced the default English 404 screen with a recovery page that follows the saved interface language and links back to Discover.
- Localized screen-reader drag instructions and announcements; announce emoji names rather than internal IDs. Enabled Enter to add picker emojis without requiring a drag.
- Added a keyboard skip link, named navigation and control groups, visible object and disclosure focus rings, and associated canvas keyboard instructions.
- Restored focus to the discovery opener when closing the gallery; kept native modal focus return for image, video, and reading dialogs. Space activates focused video-dialog buttons; playback shortcuts work from the video region. Included that region in dialog keyboard navigation.
- Added keyboard focus to scrollable creative output, hoverable/dismissible tooltips, file-menu Escape dismissal and focus return, and a focusable generation summary for scrolling.
- Improved secondary-text sizes, placeholders, canvas-caption contrast, the article language badge, picker labels, and touch controls. Validated 320 px and 390 px phone layouts without horizontal overflow. Short phone screens can use normal vertical scrolling to reach the complete discovery canvas.
- Explained when the device's reduced-motion preference controls the setting. Added an undo action after clearing Favorites or History.
- Marked Wikipedia excerpts, related concepts, saved article titles, result titles, prose, and input briefs with their content language. Source article text, museum titles, artist names, licenses, and generated/user-authored text can legitimately remain in their original language.

## Original constellation preserved

At the user's explicit request, restored the original orbital positions, animations, three guides, portal sizing, and page counts (48 desktop, 24 phone, 18 narrow phone). Removed the spacing algorithm, density reductions, collision work, and experimental orbit preview. The user accepted existing overlaps and requested no further orbit changes.

Automated accessibility checks ignore only constellation target-size findings attributable to that accepted overlap. All other rules, views, and controls remain checked.

## Verification

- Translation key/placeholder parity, automatic versus custom meanings, imported variants, saved failure localization, and interrupted-run behavior have unit coverage.
- Bilingual browser tests exercise discovery, all media dialogs, Favorites/History and clear/undo, all seven output formats, context, settings, relationships, picker keyboard addition, layering, fullscreen, generation, token details, reading/editing, import errors, locale switching, saved failures after reload, phone layouts, system reduced motion, and the skip link.
- axe checks cover those views, expanded controls, and modals using WCAG 2 A/AA, 2.1 AA, and 2.2 AA rules, except the user-accepted constellation overlap findings.
- Provider content and generation requests use browser test fixtures. No paid generation is required for this review.

Final results after restoring the original orbits and requested labels: 210 unit tests passed, TypeScript checks passed, and the production build succeeded. The final 54-scenario discovery/header/control/bilingual run passed 53 initially; the remaining media-cancellation test was corrected to wait for its debounced search results and passed in a focused rerun. Tests use source/generation fixtures and do not require paid generation.

The [restored original constellation](design/restored-orbits-en.jpg) shows the reverted orbit layout and density.

The [updated Spanish workspace](design/proofread-workspace-es.jpg) shows the implemented localization changes and requested “Crear un(a)” label.

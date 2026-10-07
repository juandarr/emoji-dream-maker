# App themes

The Themes / Temas selector sits directly below the language selector. Its four
options are Classic / Clasico (the default), Cyberpunk, Solarpunk, and Retro.
The selected theme is saved in the existing `dream-maker-v1` preferences record.
Older records and invalid theme values fall back to Classic without losing their
language, canvas view, favorites, or discovery history. A validated initializer
applies the saved theme before the first paint.

| Theme | Palette | Styling |
| --- | --- | --- |
| Classic | Existing midnight, lavender, pink, and amber | Original styling |
| Cyberpunk | Ink navy, electric cyan, hot pink | Angular surfaces and technical headings |
| Solarpunk | Warm ivory, forest green, solar gold | Botanical curves and garden arches |
| Retro | Cream, burnt rust, mustard, olive | Rounded serif headings, print texture, tactile shadows |

The directions draw on [CD Projekt Red's visual styles](https://www.cyberpunk.net/en/news/28441/c-usb-01-backup-concept-art-cp-visual-styles),
the [Solarpunk manifesto](https://hieroglyph.asu.edu/2014/09/Solarpunk-notes-toward-a-manifesto/),
and [Cooper Hewitt's psychedelic poster references](https://www.cooperhewitt.org/2018/10/23/deliberately-disorienting/).
The palettes are app-specific interpretations of those references.

## Preserved components

- The black hole retains its original renderer, silhouette, accretion disk,
  filaments, lensing, gravity response, and animation behavior. Themes apply only
  color and glow filters to the existing SVG, including its energy brightness.
- The generated result page, result history grid, and reading view retain their
  typography, ornament geometry, layout, and controls. Following the visual audit,
  their colors now match the selected theme. Transparent result wrappers avoid dark
  rectangular blocks and corner wedges in light themes. Explicit component rules
  style these surfaces independently of the general palette overrides.
- Classic is excluded from all palette and motif overrides.

## Orbit geometry

The original three radii remain 29%, 35%, and 41%, corresponding to guides with
diameters of 58%, 70%, and 82%. Classic, Cyberpunk, and Retro use circular lanes.

Solarpunk transforms both the orbit guides and the emoji plane with the same
rotation (-20 degrees) and scale (1.04 horizontally, 0.84 vertically). Each emoji
continues to revolve on its original lane, so its center follows the visible
ellipse. Counter-rotation occurs on a position wrapper, and the button applies
the inverse plane transform to keep its artwork, tooltip, and hit target upright.
Uniform canvas border widths preserve square inner coordinate spaces.

The original hover, keyboard focus, drag, gallery pause, and reduced-motion rules
also apply to the position wrappers.

## Styling and verification

`src/app/themes.css` owns the palettes, motif details, theme selector, orbital
transforms, and black hole filters. `src/app/theme-surfaces.css` applies semantic
theme tokens to the existing interface surfaces while excluding protected
results. `src/app/theme-components.css`, loaded last, supplies explicit rules for
switch states, coherent canvas corners, themed reading surfaces, interactive
borders, focus cues, and contained modal scrolling. The original black hole and
reading typography remain intact.

`tests/e2e/themes.spec.ts` covers saved-theme initialization, localization,
responsive layouts, animated orbit alignment and orientation, drag-and-drop,
palette accessibility, unchanged black hole geometry and reading layout,
visible switch states, continuous canvas corners, contained modal scrollbars,
and reversible viewport resizing. See [the visual audit](theme-visual-audit.md).
Storage tests cover migration and rejection of malformed theme values.

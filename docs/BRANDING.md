# Relay Station by Eternity Flux: identity

The product name is **Relay Station**. The full attribution is **Relay Station by Eternity Flux**. Use `relay-station` for the repository/package slug and `release/relay-station.html` for the portable app. The browser title uses the full attribution.

The product promise is: **Find what needs attention. Record the decision. Make the next step clear.** Describe it as an operational handoff desk that preserves incoming files, reviewed corrections, and responsibility for unfinished work.

The app uses a modern **Heritage Ouroboros EF** identity inspired by the owner's original Eternity Flux emblem. Its defining elements are a continuous, tapered serpent biting its tail and custom serif E/F letterforms in a diagonal arrangement. The paths are newly drawn; the historical reference PDF is not distributed with the project.

## Editable Figma source

[Open the identity review board](https://www.figma.com/design/eVpYzF8Vit3u6oO67m13Ix/Eternity-Flux-Forever-Flowing-Identity?node-id=4-69).

[Open the reusable component family](https://www.figma.com/design/eVpYzF8Vit3u6oO67m13Ix/Eternity-Flux-Forever-Flowing-Identity?node-id=4-20).

The `02 / Heritage identity` page contains native editable vector artwork, a six-variant component family, bound color variables, and a composed review board made from component instances and editable text. The logo paths were authored specifically for this identity, brought into the file as vector nodes, and assembled into the Figma component family. No bitmap or font dependency is embedded in the logo SVGs.

The review board uses Cormorant Garamond and Inter for its explanatory typography. These fonts are not needed to render the app's monogram.

## Variants and assets

| Asset | Use |
| --- | --- |
| `src/assets/brand/ef-ouroboros-gold.svg` | Compact gold mark on dark backgrounds; application navigation |
| `src/assets/brand/ef-ouroboros-bronze.svg` | Compact bronze mark on light backgrounds |
| `src/assets/brand/ef-ouroboros-ink.svg` | Compact single-color ink mark |
| `src/assets/brand/ef-ouroboros-heritage-gold.svg` | Engraved display mark on dark backgrounds |
| `src/assets/brand/ef-ouroboros-heritage-bronze.svg` | Engraved display mark on light backgrounds |
| `src/assets/brand/ef-ouroboros-heritage-ink.svg` | Engraved single-color display mark |
| `public/favicon.svg` | Compact gold mark in a midnight tile |
| `docs/images/ef-identity.png` | Exported Figma identity review board |

The previous infinity-serpent study is not the active identity. Historical versions remain available in Git history.

## Use and sizing

Use the **compact** variant below 120 px. It retains the serpent silhouette and serif letters while removing engraving that would become visual noise. The current application header uses 48 px on desktop and 40 px on smaller screens. The review board includes 64, 48, and 32 px studies.

Use the **display** variant for larger presentations and identity compositions. Keep the square aspect ratio and allow clear space around the full silhouette. Avoid stretching, rotating, or adding competing effects. Both variants have transparent backgrounds; engraving and facial details are cutouts rather than painted background colors.

| Color | Hex |
| --- | --- |
| Gold | `#D8B878` |
| Bronze | `#8F6A43` |
| Ink / midnight | `#102433` |
| Ivory | `#F4F0E7` |

The application embeds its SVG in the JavaScript build so the portable HTML remains self-contained. The offline build also embeds the favicon. Updating the identity must not introduce remote image or font requests.

## License and identity

The software and included artwork use the repository's MIT license. Preserve the applicable copyright and license notices when redistributing them. The Eternity Flux name and mark identify this project's origin; inclusion of artwork does not imply that Eternity Flux endorses a modified distribution. Make a fork's authorship and identity clear to its users.

A product rename does not require a new MIT license. Keep existing browser-storage identifiers and session formats compatible when changing visible names.

The legal notice remains **Copyright (c) 2026 Mohsin Siddiqi, trading as Eternity Flux Technologies**. The product's “by Eternity Flux” attribution does not replace the copyright holder. Legacy compatibility identifiers and historical release records may retain earlier wording; current app headings, screenshots, downloads, and reader-facing documentation use Relay Station.

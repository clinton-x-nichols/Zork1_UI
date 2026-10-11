# Future Work

Development is currently paused. The following maintenance work is intentionally
deferred.

## Optimize artwork storage and delivery

- Convert painted scene PNGs and large JPEGs to WebP at a visually reviewed
  quality setting, initially targeting quality 82-85.
- Keep the current source dimensions where they benefit high-density displays;
  retain PNG only for assets that require transparency and retain SVG artwork.
- Update asset references and `game-data.js`, then verify every scene and state
  variant in both direct `file://` play and the GitHub Pages deployment.
- Compare representative images before applying a bulk conversion. Do not
  replace artwork that shows a visible loss of important detail.
- Record the new paths and checksums in `docs/artwork-manifest.json`.
- After validation, consider rewriting the repository's young Git history and
  force-pushing so removed binary data no longer affects clone size. Coordinate
  this explicitly if outside forks or contributors exist by then.

Baseline measured on 2026-10-10:

- `images/`: approximately 525 MiB
- 105 PNG files: approximately 406 MiB total, 3.87 MiB average
- 97 JPEG files: approximately 116 MiB total, 1.19 MiB average
- packed Git repository: approximately 509 MiB

An initial target of 100-180 MiB for the complete artwork set is reasonable,
subject to visual comparison and gameplay testing.

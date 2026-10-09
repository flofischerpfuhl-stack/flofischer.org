# Private 3D asset library

Raw third-party 3D files live under `private-assets/` and are ignored by Git. The checked-in video project stores only asset IDs, transforms, lightweight previews that are independently licensed for distribution, and attribution text.

## Fixed license rules

- Prefer CC0. Attribution is optional but source and provenance are still recorded.
- CC BY is allowed only when complete attribution in the public video description is sufficient. Store creator, title, source URL, license name, and license URL.
- Sketchfab Free Standard is allowed only for the private single-seat library. Never commit, publish, sublicense, or expose the raw file for extraction.
- Exclude CC BY-NC, CC BY-NC-SA, Editorial, unknown-license, non-downloadable, and any license that requires credit inside the rendered video.
- Re-check the model page and license immediately before every first download. Save download date, source URL, license snapshot, file type, size, and SHA-256.
- Generated or internally created assets use a separate provenance record and are not presented as downloaded 3D scans.

## Selection workflow

1. Search `private-assets/catalog.json` by subject, symbolism, period, material, silhouette, and polygon budget.
2. Prefer an existing approved asset and reuse its stored framing and attribution.
3. If nothing fits, browse for a more suitable model. Verify download availability and license on the model page before downloading.
4. Normalize the preferred delivery to GLB when the license permits modification. Keep the untouched source archive beside the normalized derivative.
5. Test the GLB with `RealGltfAsset` in `src/SceneAsset.tsx`; choose deterministic frame-based movement and project-specific lighting.
6. Add the final attribution to the project's `delivery/video-description.*.md` before rendering.

## Current integration status

The 40-second pink-sky concept uses a generated transparent sculpture as a clearly documented temporary asset. `RealGltfAsset` is ready for the authenticated Sketchfab download that will replace it.

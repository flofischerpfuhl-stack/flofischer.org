# 3D asset selection and licensing

The private catalog lives at `C:\Users\flori\source\flofischer.org\tools\seele-video-studio\private-assets\catalog.json`. Raw files live below the same private directory and must stay outside Git.

## Selection order

1. Read the scene's claim, symbol, emotional register, silhouette needs, and movement needs.
2. Search the private catalog by subject, period, material, tags, and polygon budget.
3. Reuse an approved model when it fits. Preserve its stored attribution and source metadata.
4. If no model fits, browse reputable libraries for a better candidate. Check the exact model page rather than relying on search-result badges or collection-level claims.
5. Before download, verify that a download is actually available and save the displayed license and license URL.

## Fixed rules

- CC0: allowed. Keep provenance even though attribution is optional.
- CC BY: allowed only when creator, title, source URL, license name, and license URL can appear in the public video description instead of inside the rendered frame.
- Sketchfab Free Standard: allowed only for Florian's private single-seat library. Never publish or commit the raw or normalized model, and do not create a deliverable that lets viewers extract it.
- CC BY-NC, CC BY-NC-SA, Editorial, unknown license, missing download, and any on-screen-credit requirement: exclude unless Florian explicitly changes the policy for a named asset and project.

## Intake record

Keep the untouched download and the normalized GLB together. Record:

- stable asset ID, title, creator, source URL, and download date;
- exact license name and license URL;
- original filename, MIME/type, byte size, and SHA-256;
- normalized filename and SHA-256;
- attribution string ready to paste into `delivery/video-description.*.md`;
- useful tags, polygon count, scale/orientation notes, and tested framing.

Use deterministic frame-derived animation for renders. A slight rotation, float, or camera drift should support depth without becoming the subject of the scene. Author text/asset occlusion deliberately; do not alternate layers randomly.

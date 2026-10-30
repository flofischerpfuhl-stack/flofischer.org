# Fernwork Games art

Textures (`t-*`), backdrops (`s-*`) and key art (`k-*`) were generated for Fernwork on 2026-10-24 with OpenAI's
image model (gpt-image, via Codex) from our own prompts, then made tileable and converted to WebP. The characters
in the key art (Fern Rangers, Rotlings, Moss Brutes, Pip, Grumbles) are Fernwork's own designs; the in-game 3D
models are built from primitives in `tools/js/games/characters.js`.

`worldmap/<family>/<region>.far.glb` are the reduced twins of the authored Fernworld regions (about 7 % of the triangles, vertex
colours kept, meshopt-compressed, 28-62 KB each, 711 KB for all 21). The world maps show them for every region that is not under
foot. Rebuild with `GLTFPACK=<path to gltfpack> node tools/games-assets/worldmap/build-far.mjs` (it reads
`fernworld/environments/catalog.json` and writes `worldmap/index.json`). `fernworld/` itself is untouched.

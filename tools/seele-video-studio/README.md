# Seele Video Studio

Wiederverwendbare Remotion-Vorlage für 16:9-Videos aus Artikeln von `seele.flofischer.org`.

## Aktuellen 40-Sekunden-Test rendern

```powershell
npm install
npm run voice
npm run typecheck
npm run render:test -- "C:\Users\flori\Documents\Codex\upload\seele-video-concepts"
npm run qa -- "C:\Users\flori\Documents\Codex\upload\seele-video-concepts"
```

Die aktive Komposition `PinkSky-Test-40s` ist 1920×1080, 30 fps und 40 Sekunden lang. Die Schwesterkompositionen für blauen und dunklen Himmel sind für spätere Videos vorbereitet, aber nicht Teil des aktuellen Testexports. `VideoQuote-Reaction-Demo` zeigt den wiederverwendbaren Play-/Pause- und VHS-Hold-Zustand.

Der rosa Himmel besteht aus mehreren unterschiedlich bewegten Ausschnitten desselben generierten Matte-Paintings. Das erzeugt langsame Parallaxe ohne sichtbare Schleife. Das aktuelle Engelsmotiv ist ein dokumentiertes Konzeptasset; `RealGltfAsset` in `src/SceneAsset.tsx` ist für ein später authentifiziert heruntergeladenes GLB vorbereitet.

Lizenz- und Bibliotheksregeln stehen in `docs/asset-library.md`. Rohmodelle und der lokale Katalog liegen ausschließlich in `private-assets/` und werden von Git ignoriert.

## Projektgedächtnis

Jedes Video liegt unter `projects/<slug>/` mit:

- unveränderter Artikelkopie und Hash,
- eigenem Videoskript pro Sprache und Version,
- strukturierten Revisionen,
- ausdrücklich freigegebenen Stilentscheidungen.

Entwürfe gelten nicht automatisch als Präferenz. Erst explizite Freigaben in `feedback/decisions.md` werden beim nächsten Skript als Beispiele berücksichtigt.

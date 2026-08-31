# Seele Video Studio

Wiederverwendbare Remotion-Vorlage für 16:9-Videos aus Artikeln von `seele.flofischer.org`.

## Konzeptvergleich rendern

```powershell
npm install
npm run voice
npm run typecheck
npm run render:all -- "C:\Users\flori\Documents\Codex\upload\seele-video-concepts"
npm run qa -- "C:\Users\flori\Documents\Codex\upload\seele-video-concepts"
```

Alle fünf Kompositionen sind 1920×1080, 30 fps und 20 Sekunden lang. Sie teilen Skript, Sprache und Zeitmarken. `Botanical3D.tsx` rekonstruiert Kreuz, Zweige, Blätter und Blüten aus echten Three.js-3D-Koordinaten und projiziert sie deterministisch in SVG; dadurch bleibt das Rendering reproduzierbar und benötigt kein WebGL.

## Projektgedächtnis

Jedes Video liegt unter `projects/<slug>/` mit:

- unveränderter Artikelkopie und Hash,
- eigenem Videoskript pro Sprache und Version,
- strukturierten Revisionen,
- ausdrücklich freigegebenen Stilentscheidungen.

Entwürfe gelten nicht automatisch als Präferenz. Erst explizite Freigaben in `feedback/decisions.md` werden beim nächsten Skript als Beispiele berücksichtigt.

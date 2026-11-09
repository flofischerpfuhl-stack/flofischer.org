# HimmelCAD Builder – vollständige Mock-UI-Komponenten-Library

Öffentlich bereitgestellte Quellcode-Kopie für den Bergwork-Projects-Prototyp. Nicht nur die in Bergwork bereits verwendete Teilmenge und nicht der minifizierte Website-Build.

## Einstieg

- **Vollständige Builder-Library:** [`apps/builder-ui-lab/src/ui/`](apps/builder-ui-lab/src/ui/) – alle 71 Originaldateien, einschließlich `Library.tsx`, `index.ts`, Komponenten, CSS, Tokens und Fixtures.
- **Komponentengalerie:** [`apps/builder-ui-lab/src/ui/Library.tsx`](apps/builder-ui-lab/src/ui/Library.tsx).
- **Zusätzliche gemeinsame UI-Komponenten:** [`packages/@himmelcad/ui/`](packages/@himmelcad/ui/).
- **Designsystem und Fonts:** [`packages/@himmelcad/theme/`](packages/@himmelcad/theme/).
- Für relative Quellcode-Importe zusätzlich benötigte Dateien liegen unter ihren ursprünglichen Pfaden bei.

## Verwendung durch eine KI

1. Dieses öffentliche Repository klonen oder die benötigten Dateien über `raw.githubusercontent.com` abrufen.
2. Mit `Library.tsx`, `index.ts`, `tokens.css` und den Styles der gewünschten Komponenten beginnen.
3. Benötigte Komponenten samt Abhängigkeiten in das eigene TypeScript-/React-Projekt übernehmen. Originaldateien möglichst unverändert lassen und App-Anpassungen separat halten.
4. React/React DOM und Lucide installieren; für zusätzliche gemeinsame Komponenten gegebenenfalls Zustand und entsprechende Host-Adapter bereitstellen.
5. Dies ist **kein unabhängig paketiertes oder insgesamt standalone baubares NPM-Paket**. Die ursprüngliche Library stammt aus einem größeren Monorepo. Einige optionale CAD-/Projekt-Komponenten des zusätzlichen `@himmelcad/ui`-Pakets verwenden Host-APIs wie `@himmelcad/app` und `@himmelcad/data`. Diese CAD-Backends werden für Bergwork Projects nicht benötigt und sind hier nicht vollständig veröffentlicht. Die Basis-Komponenten der Builder-Library lassen sich gezielt wiederverwenden.

## Herkunft und Lizenz

- Ursprung: HimmelCAD, `origin/main`, Revision `504462cd14c77f2168467b23aaf3979951eb0643`.
- 199 Quelldateien und Lizenzdateien unverändert kopiert; alle 71 Dateien des ursprünglichen `src/ui`-Verzeichnisses enthalten.
- `SOURCE-MANIFEST.json` listet die Dateien mit SHA-256-Prüfsummen zur Kontrolle byteidentischer Übernahme.
- Originale Business-Source-Lizenz und Drittanbieterhinweise liegen unter `LICENSE` und `LICENSES/`. Die Veröffentlichung macht den Code nicht automatisch MIT- oder anderweitig freizügig lizenziert.

Diese Referenz liegt absichtlich **außerhalb** von `sites/`: kein zusätzliches UI-Bundle, kein Eingriff in die laufende Bergwork-Projects-Demo und kein Aufblähen der ausgelieferten Website-Assets.

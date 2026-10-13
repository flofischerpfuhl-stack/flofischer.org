# Projektbericht Kanalsanierung Fuldabrück

Stand **30. September 2026** · Ingenieurbüro Fischer · Bauabschnitte 1–4

## Zusammenfassung

Bis Ende Q3 sind **38 von 52 Haltungen** inspiziert. Drei Schäden der Klasse 4 müssen noch vor dem Winter saniert werden.
Das Budget ist zu 64 % gebunden; die Inliner-Ausschreibung für BA 2 geht Ende Oktober raus.

## Fortschritt

| Bauabschnitt | Haltungen | Inspiziert | Saniert | Stand |
|---|---:|---:|---:|---|
| BA 1 Lindenstraße | 14 | 14 | 9 | Abschlussbefahrung 15.12. |
| BA 2 Am Weinberg | 16 | 14 | 0 | Ausschreibung läuft |
| BA 3 Kirchweg | 12 | 8 | 0 | Befahrung KW 44 |
| BA 4 Gewerbegebiet | 10 | 2 | 0 | geplant 2027 |

## Schäden

- **Klasse 4 (sofort):** 3 Haltungen, Einbruch und Wurzeleinwuchs
- **Klasse 3 (kurzfristig):** 8 Haltungen, Risse und Muffenversatz
- **Klasse 1–2:** 27 Haltungen, beobachten

> Die Haltung S1–S2 in der Lindenstraße hat nur 1,2 % Gefälle. Vor dem Inliner prüfen wir die Hydraulik.

## Auswertung

Die Haltungslängen kommen direkt aus der Kanaldatenbank:

```sql
SELECT abschnitt, COUNT(*) AS haltungen, ROUND(SUM(laenge_m), 1) AS meter
FROM haltungen
WHERE inspiziert = 1
GROUP BY abschnitt
ORDER BY abschnitt;
```

## Nächste Schritte

- [x] Befahrung BA 1 abgeschlossen
- [x] Schadensklassen mit dem Bauamt abgestimmt
- [ ] Inliner-Ausschreibung BA 2 bis 31.10.
- [ ] Anwohnerinformation Lindenstraße in KW 45
- [ ] Sanierung der Klasse-4-Schäden im November

## Anhang

Pläne liegen als DXF im Projektordner (`grundriss.dxf`, EPSG:25832). Fragen gern an das Projektteam.

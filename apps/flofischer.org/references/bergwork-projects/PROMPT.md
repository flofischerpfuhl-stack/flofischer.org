# Auftrag: Bergwork Projects – klickbarer Web-Prototyp

Baue einen vollständigen, benutzbaren Prototyp einer Projektverwaltungssoftware namens **Bergwork Projects**. Du hast keinen Zugriff auf meine Rechner, privaten Dateien, Microsoft-Konten oder sonstigen Daten. Alle benötigten fachlichen Vorgaben stehen unten. Verwende ausschließlich erfundene, zusammenhängende Beispieldaten.

**Lieferung: vollständiger Quellcode als Download/ZIP, Startanleitung und echte Screenshots der tatsächlich ausgeführten Website. Nicht bei mir veröffentlichen, nichts auf meinen Servern deployen, keine Zugangsdaten anfordern.** Nicht bei einem Konzept, statischen Bild oder ungetesteten Codegerüst stehenbleiben.

## Öffentlich abrufbare Designquellen

Repository: https://github.com/flofischerpfuhl-stack/flofischer.org

Die vollständige HimmelCAD-Builder-Mock-UI-Komponenten-Library wurde hierfür öffentlich kopiert:
`apps/flofischer.org/references/bergwork-projects/himmelcad-builder-ui/`

Direkter Einstieg:
https://github.com/flofischerpfuhl-stack/flofischer.org/tree/main/apps/flofischer.org/references/bergwork-projects/himmelcad-builder-ui

- Dort `README.md` lesen.
- Vollständige eigentliche Builder-Library: `apps/builder-ui-lab/src/ui/` innerhalb dieser Referenz; insbesondere `Library.tsx`, `index.ts`, `tokens.css` und Komponenten-CSS.
- Zusätzlich liegen `packages/@himmelcad/ui` und `packages/@himmelcad/theme` mit Fonts und weiteren gemeinsamen Komponenten bei.
- Dateien über Git/GitHub/raw.githubusercontent.com beziehen. Kein Zugriff auf das private HimmelCAD-Repo erforderlich.
- Die Referenz ist eine Monorepo-Quellcode-Kopie, kein vollständig unabhängig installierbares NPM-Paket. Passende UI-Komponenten samt Abhängigkeiten gezielt in dein Projekt übernehmen. Für optionale CAD-Hostkomponenten keine kompletten CAD-Backends nachbauen; ihre Fachlogik ist für diesen Auftrag nicht erforderlich.
- Echte Komponenten, Tokens, Typografie, Icons, Listen, Felder, Menüs, Dialoge, Buttons und Fokusverhalten wiederverwenden. Nicht bloß einen ähnlichen Standard-Look erfinden. Originaldateien möglichst unverändert lassen, App-Anpassungen separat. Herkunft und Original-Lizenzhinweise erhalten.

Originales Bergwork-Icon:
https://raw.githubusercontent.com/flofischerpfuhl-stack/flofischer.org/main/apps/flofischer.org/sites/gehirn/projects/bergwork-mark.svg

Es muss **Bergwork Projects** unter Bergwork-Branding sein, nicht HimmelCAD. Originales Icon verwenden, kein selbst erfundenes Bergsymbol. Eine produktive Arbeitsoberfläche im reduzierten Builder-Look bauen, keine Landingpage, Hero-Sektion oder Sammlung dekorativer Dashboard-Kacheln. Dunkler Standardmodus; heller Modus gern zusätzlich. UI auf Deutsch. Die vorhandene veröffentlichte Projects-Demo ist keine Anforderung, ihren Quellcode zu haben oder ihre konkrete Umsetzung zu kopieren: Entscheidend sind diese Anforderungen und die vollständige Komponenten-Library.

## Technik und Umfang

- Frontend in TypeScript, bevorzugt React und Vite passend zur Library.
- Zunächst Web-Prototyp. Später soll daraus eine Electron-App werden; das eigentliche Backend und die Integrationen können später in Rust entstehen. Jetzt weder Electron-Paket noch Rust-Backend notwendig.
- Fachmodell, Zustand und Integrationsadapter von der Darstellung trennen.
- Lokale Persistenz, beispielsweise localStorage, und eine Demo-Zurücksetzen-Funktion.
- Für diesen Prototyp sind Microsoft-Login und Microsoft 365 **simuliert**. Keine echten Graph-, Outlook- oder Teams-Zugriffe, kein Passwortformular, keine echten E-Mails verschicken. Simulation deutlich kennzeichnen; Aktionen müssen aber den tatsächlichen lokalen Demo-Zustand verändern.
- Späteres Produktziel: ein Microsoft-Login mit berechtigtem Zugriff auf die benötigten Microsoft-365-Daten – Mail, Dateien, Unternehmensmitarbeiter, Kalender, Kontakte und Teams. Daraus keine pauschale Berechtigung für fremde/private Daten ableiten.
- Keine Geheimnisse, persönlichen Daten, Kundendaten oder fremden internen URLs übernehmen.

## Navigation und Projektanlage

Links eine durchgehende, Explorer-artige Spalte:
1. `Unternehmen`
2. Benutzername, etwa der erfundene `Alex Weber`
3. Darunter die Projekte mit ihren Namen, wie im Dateiexplorer.

In bzw. hinter jeder Projektzeile ein dezenter Fortschrittsbalken; zusätzlich Prozent und erledigte/alle Aufgaben anzeigen. Der Fortschritt wird aus den tatsächlichen Aufgaben berechnet, nicht statisch eingetragen.

Ganz unten ein dauerhaft erreichbares `+`/`Neues Projekt`. Es öffnet ein Popup mit Projektname, Projektnummer und Vorlage. Bestätigen legt ein echtes Demo-Projekt mit Ordnern, Aufgaben, Buckets und zugehörigen simulierten Microsoft-Verknüpfungen an.

Alle Unternehmensmitarbeiter sehen grundsätzlich alle Unternehmensprojekte. Unternehmensbereich mit Mitarbeiterübersicht; persönlicher Benutzerbereich mit den eigenen Mails, Aufgaben, Terminen und Kontakten.

Im angeklickten Projekt oben diese Tabs in dieser Reihenfolge:
**Dateien – Mail – Aufgaben – Chat – Kalender – Kontakte.** Alle Bereiche müssen funktional bedienbar sein.

## Eine gemeinsame Projektvorlage und Dateistruktur

Wichtige Klarstellung: Es sollen **nicht zwei getrennte ING-/LV-Vorlagen** angeboten werden. Die ursprünglich vorhandenen zwei Strukturen sind zu **einer harmonisierten gemeinsamen Struktur** zusammenzuführen. Eine Vorlage `Vermessungsprojekt` reicht zunächst. Gleiche Inhalte zusammenführen, Fachbereiche erhalten, keine doppelten Kategorien oder personenbezogenen Prüfordner.

Verwende diese gemeinsame Struktur; Unterordner ebenfalls tatsächlich anlegen:

```text
01_Eingang/
02_Ausgang/
03_Messung/
  Absteckdaten/
  Messprotokolle/
  Bestandsaufnahme/
04_Planung/
  Bestandsplan/
  Lageplan/
  Teilungsplan/
  Katasterauszüge/
05_Prüfung/
  Reservierungen/
  Fortführungsnachweis/
  Flächenberechnung/
  Fortführungsriss/
  Eigentümernachweis/
  Beanstandungen/
06_Abgabe/
  Teilungsanzeige/
  Abgabe VA/
  FN-Bekanntgabe/
  Beanstandungen VA/
07_Bilder/
08_Rechnung/
  Rechnungsentwurf/
  Rechnungen/
09_Software/
  Agisoft/
  GeoTKF/Import/
  GeoTKF/Export/
  CloudCompare/Import/
  CloudCompare/Export/
  Cremer/Import/
  Cremer/Export/
  VermCAD/Import/
  VermCAD/Export/
  BricsCAD/
10_KI/
11_Dokumente/
12_Export/
  99_Alt/
99_Alt/
```

Explorer-artige Dateiansicht mit Ordnernavigation. Beispiel-Dateien lassen sich öffnen bzw. als eindeutig bezeichnete Demodateien herunterladen. Die Vorlage bestimmt Ordnerstruktur und Startaufgaben; eine einfache Vorlagenverwaltung darf beides für neue Projekte bearbeiten.

## Mail und Outlook-Zuordnung

Im Benutzerbereich unter `Mail` alle persönlichen E-Mails zeigen, Outlook-artig mit Mail-Liste links und Vorschau rechts. Direkt antworten, allen antworten, weiterleiten, neue Mail verfassen und Entwurf speichern. Lokales Demo-Senden soll eine Nachricht erzeugen und klar sagen, dass nichts echt verschickt wurde.

Eine Mail soll per Drag-and-drop auf ein Projekt in der linken Spalte zugeordnet werden können. Zusätzlich ein Zuordnungsmenü für Handy/Tastatur anbieten.

Die Zuordnung gilt für die **ganze Unterhaltung/Conversation**, einschließlich vorhandener und zukünftiger Antworten. Nicht nur anhand identischer Betreffzeilen verknüpfen.

Wichtige Klarstellung: Nicht nur interne Projekt-Tags vergeben. Es sollen auch **Outlook-Projektordner** entstehen und ihre Zuordnung soll **in beide Richtungen synchronisiert** werden:
- Bergwork-Zuordnung verschiebt/ordnet die Unterhaltung entsprechend dem Outlook-Projektordner zu.
- Verschieben in der Outlook-Seite aktualisiert die Projektzuordnung in Bergwork.
- Rückverschieben in den Posteingang sinnvoll behandeln.

Für den Prototyp eine klar beschriftete Outlook-Simulation oder ein Panel anbieten, mit dem diese Rückrichtung wirklich demonstriert werden kann. Inbox, Projektansichten, Antworten und Ordnerzuordnung müssen denselben konsistenten Demo-Zustand nutzen.

Für jede eingehende projektzugeordnete Mail automatisch unter `01_Eingang` einen Ordner `YYYY-MM-DD - Absender` anlegen und ihre Anhänge darin ablegen. Auch nach späterer Zuordnung vorhandener Mails auslösen. Neue simulierte Antworten ebenfalls berücksichtigen. Keine doppelten Ordner/Anhänge bei erneutem Rendern oder Sync; Kollisionen verschiedener Nachrichten mit gleichem Datum/Absender sinnvoll behandeln. Beispielmails müssen echte lokale Demo-Anhänge besitzen, die in der Dateiansicht erscheinen und geöffnet/heruntergeladen werden können.

## Aufgaben wie Microsoft Planner

Kanban-Board mit Aufgaben, Mitarbeiterzuweisung und bearbeitbaren Buckets.

Wichtige Klarstellung: **Bucket und Aufgabenstatus sind dasselbe.** Keine zweite unabhängige feste Statusliste. Neue/umbenannte Buckets müssen unmittelbar als mögliche Aufgabenstatus erscheinen.

Start-Buckets:
- Backlog
- ToDo
- In Bearbeitung
- Bearbeitung Extern
- Prüfung
- Abgeschlossen

Startaufgaben aus der gemeinsamen Vorlage:
- DFK/NAS einholen
- Baulasten und Kanalplan anfragen
- Bestandsaufnahme
- Bestandsplan zeichnen
- Lageplan erstellen
- Vorabsteckung
- Schnurgerüst einschneiden

Aufgaben anlegen, bearbeiten, Unternehmensmitarbeitern zuweisen und zwischen Buckets verschieben können. Desktop per Drag-and-drop, mobil zusätzlich per Menü. Aufgaben im Abschluss-Bucket treiben die Fortschrittsberechnung in der Projektliste an. Neue Aufgaben verändern auch den Nenner.

## Teams-basierter Projektchat

Wichtige Klarstellung: **Ein gemeinsames Team `Bergwork Projects`, darin je Projekt ein eigener Kanal.** Nicht für jedes Projekt ein eigenes Team.

Projektchat soll perspektivisch im entsprechenden Microsoft-Teams-Kanal stattfinden und dort ebenfalls sichtbar sein. Im Prototyp gemeinsame lokale Nachrichten verwenden: Nachricht in Bergwork schreiben und im simulierten Teams-Kanal wiederfinden; eine simulierte Teams-Antwort muss auch im Projektchat erscheinen. Nicht nur einen Toast oder funktionslosen Teams-Link anzeigen. Team und Kanal im UI erkennbar machen.

## Kalender und Kontakte

- Kalender als brauchbare Agenda-, Wochen- oder Monatsansicht.
- Termine anlegen und optional einem Projekt zuordnen.
- Benutzeransicht zeigt persönliche Termine insgesamt, Projektansicht passend gefiltert.
- Teilnehmer aus den Unternehmens-Demomitarbeitern wählen.
- Kontakte automatisch aus eingehenden E-Mails erzeugen; anhand der E-Mail-Adresse deduplizieren.
- Bestehende persönliche/Microsoft-Demokontakte Projekten zuordnen und Zuordnung wieder entfernen.
- Kontaktdetails anzeigen und bearbeiten können.

## Zusammenhängende Demo und Bedienbarkeit

Direkt in einer überzeugenden Demo-App starten, nicht hinter einer Anmeldewand. Microsoft-Demo-Account sichtbar; An-/Abmeldung simulierbar. Drei bis vier erfundene Projekte mit unterschiedlichen Fortschritten, plausiblen Mails samt Anhängen, zugewiesenen Aufgaben, Chatnachrichten, Terminen und Kontakten vorbereiten. Die Daten sollen zwischen den Bereichen tatsächlich zusammenhängen.

Desktop und Handy sinnvoll unterstützen. Mobile Alternativen zu Drag-and-drop, lesbare Mailansicht, erreichbare Navigation und Dialoge. Tastaturbedienung, Escape, sinnvoller Dialogfokus, Rückkehr des Fokus und verständliche Beschriftungen berücksichtigen. Keine funktionslosen Hauptbuttons oder bloßen Platzhalter-Tabs.

## Prüfung und Lieferung

1. Projekt selbst starten und einen echten Produktionsbuild ausführen. TypeScript-Fehler beheben.
2. Fachlogik testen: Vorlagenanlage, Fortschritt/Buckets, Conversation-Zuordnung, Outlook-Rückrichtung, idempotente Anhangsablage, Kontakt-Deduplizierung und Persistenz.
3. Im echten Browser automatisiert prüfen: Projektanlage, Mailantwort, Drag-and-drop Mail→Projekt, Aufgabe→Abgeschlossen, neue Buckets, Outlook-Rückrichtung, Dateizugriff, Chat in beiden Ansichten, Kalender und Kontakte sowie mobile Navigation.
4. Echte Screenshots der laufenden Anwendung liefern, nicht generierte Bilder oder HTML-Mockbilder: mindestens Desktop-Dateien, Desktop-Mail, Desktop-Aufgaben und mobile Mail-/Projektansicht. Richtwerte Desktop 1440×1000, Handy 390×844.
5. Screenshots selbst auf Layoutfehler prüfen; keine unerklärten Konsolenfehler oder unbedienbaren Dialoge zurücklassen.
6. Vollständigen Quellcode als ZIP/Download liefern, inklusive verwendeter Komponenten, Assets, Konfiguration, Lockfile und Tests; ohne node_modules, Zugangsdaten oder Paket-Caches.
7. README mit konkreten Installations-, Start-, Build- und Testbefehlen sowie Herkunft der UI-Library und Hinweis auf reine Microsoft-Simulation.
8. Kurz berichten, welche Tests tatsächlich gelaufen sind und welche Grenzen bestehen. Keine ausgeführten Tests, Screenshots oder Integrationen erfinden.

**Keine Veröffentlichung auf meinen Domains oder Servern. Ergebnis an mich: lauffähiger Code + echte Screenshots + kurze Startanleitung.**

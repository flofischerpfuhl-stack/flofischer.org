# Host-Zettel — Schlag den Ehepartner

**Online:** https://hochzeit.flofischer.org · **Beamer:** /screen
**Host-PIN:** Cloudflare-Secret `HOST_PIN`; nicht ins Repository schreiben.

## Vor dem Start

- Moderation und Beamer einmal neu laden, damit beide die aktuelle Version verwenden. Ein Reload setzt keine Show zurück.
- Lautsprecher am **Moderationsgerät** testen: Dort werden die Melodien abgespielt, nicht automatisch am Beamer. iPads und Gäste verwenden ihre QR-Codes.
- „Sicherung speichern“ lädt den aktuellen Spielstand herunter. Die Moderation hält zusätzlich eine Browser-Sicherung vor (nach Moderator-Änderungen und ungefähr alle 30 Sekunden). Bei fehlender Verbindung wird die letzte vorhandene Sicherung mit ihrem tatsächlichen Zeitstempel angeboten.
- Nur „Neue Show“ setzt Punkte und Karten zurück und verlangt „NEU“. Rückgängig/Wiederholen stellt Moderator-Zustände wieder her.

## Was auf der Seite bleibt

Karten, Regeln, Timer, Ergebnisse und Punkte laufen über die Website. Die Landkarte und Gästeabstimmungen bleiben digital. Für Stechen werden keine Handy-Buzzer oder zusätzlichen Team-QRs benötigt.

1. Karte einmal antippen: Titel aufdecken. Andere Karte antippen: vorherige klappt zu.
2. Zweites Antippen nach der Animation: Spiel öffnen.
3. Den angezeigten Ablauf durchführen. Physische Ergebnisse bestätigen; Quiz, Karte, Messung und Voting werten automatisch.
4. Gewertete Karten bleiben erledigt. Fehlwertung über Rückgängig korrigieren.

## Stechen und Zählen

- **Quiz-Stechen:** Antwort ausrufen lassen. Du entscheidest, wer zuerst dran war, hörst die Antwort an und klickst das Team. Danach Lösung aufdecken und richtig/falsch werten. Falsch bedeutet Sieg fürs andere Team. „Niemand weiß es“ beendet ohne Punkte. Die Auswahl kann vor dem Aufdecken korrigiert werden.
- **Klimmzüge:** Vier abwechselnde Versuche. Eine Person zählt laut, die Gesamtzahl wird einmal pro Versuch eingetragen (auch null). Keine Einzelklicks pro Klimmzug.
- **Hemd:** Zehn Personen je Team und genau eine feste Hilfsperson. Erst nach vollständigem **An- und wieder Ausziehen** klicken. Beim zehnten vollständigen Durchgang stoppt die Uhr.
- **Liegestütze:** Neutral laut bis 40 zählen; nur Start und Stopp klicken.
- **Physischer Gleichstand:** Kurzes Stechen laut Spielregel durchführen und dessen Sieger eintragen. Alternativ ausdrücklich ohne Punkte abschließen. Bei Staffelzeiten zählt die angezeigte Zehntelsekunde.
- **Pantomime:** Kathi, dann Anton; jeweils **60 Sekunden insgesamt**, höchstens sechs Begriffe. Nur die darstellende Person sieht den Begriff auf deinem Gerät. Richtig/Überspringen wechselt weiter. Nach Ablauf keine neuen Punkte, dann Runde beenden. Keine Papierkarten erforderlich.

## Landkarte

- Beide Team-QRs scannen. Die Karte ist bis 800 % zoombar.
- Pin setzen und bestätigen. Ein fehlgeschlagener letzter Pin muss neu gesetzt werden; ein alter Pin wird dann nicht versehentlich bestätigt.
- Sobald beide bestätigt haben, werden Pins, Ziel und Entfernungen öffentlich. Nach drei Runden entscheiden Rundensiege, dann Gesamtdistanz; Punkte automatisch.
- QR-Codes erneuern macht alte Links ungültig.

## Gästeabstimmung

- Gäste können den öffentlichen QR schon vor dem Start scannen.
- Bei Prozentfragen beide Tipps gemeinsam speichern und dann öffnen. Bei Witzen erst beide Beiträge anhören, beim Brautkleid erst Zeitende und Laufsteg/Sicherheitscheck, dann öffnen.
- Nach 30 Sekunden schließen auch die Handybuttons automatisch. Bei Bedarf „Weitere 30 Sekunden“ bzw. „Erneut öffnen“; bereits abgegebene Stimmen bleiben erhalten.
- Ohne Stimmen gibt es kein Ergebnis. Erneut öffnen statt das ganze Spiel neu starten.
- Nach der Auflösung erscheinen Stimmen, Teamtipps und bei Prozentfragen der tatsächliche Anteil auf dem Beamer. Gleich nahe Tipps erhalten beide Punkte; direkte Publikums-Stimmengleichheit gibt keine Punkte.

## Verbindung und Zeitmessung

Moderator-Klicks tragen ihren ursprünglichen Zeitpunkt. Eine verzögerte oder wiederholte Übertragung verlängert die gespeicherte Laufzeit nicht. Startsignal und Startklick deshalb gemeinsam geben. Die Gerätezeit wird mit dem Server abgeglichen; das ist keine Sportmessanlage.

Bei unbestätigter Aktion zeigt die Seite einen dauerhaften Hinweis und sendet dieselbe Aktion erneut. Bis zur Bestätigung keine weiteren Moderator-Aktionen durchführen. Bei einem Konflikt mit einer anderen Moderation wird die Aktion verworfen und muss am aktualisierten Stand bewusst wiederholt werden. Gäste-/Karten-Eingaben mit Fehlerhinweis bitte erneut eingeben bzw. bestätigen.

**Die Online-Seite braucht weiterhin Internet.** Bei vollständigem Ausfall ist der lokale Betrieb im gemeinsamen WLAN der Ersatz. Internetloses WLAN reicht; isolierte Gäste-Netze, die Geräte voneinander abschotten, funktionieren dafür nicht.

## Lokal im WLAN spielen

Node.js und Abhängigkeiten sind auf diesem Rechner vorbereitet. Terminal im Ordner `apps/hochzeit.flofischer.org`:

```bash
npm run dev:node
```

Standard-PIN lokal: `0000`; mit der Umgebungsvariable `HOST_PIN` lässt sich eine andere festlegen. Das Terminal zeigt die LAN-Adresse, z. B. `http://192.168.1.10:8787`.

1. **Auch die Moderation mit dieser LAN-Adresse öffnen**, damit QR-Codes auf die erreichbare Laptop-Adresse zeigen. Nicht `localhost` für die Moderation verwenden.
2. Beamer öffnet dieselbe Adresse mit `/screen`; alle Geräte müssen im selben erreichbaren WLAN sein. Laptop am Strom lassen, Energiesparen/Ruhezustand während der Show vermeiden.
3. Optional „Sicherung laden“ und die vorher online heruntergeladene JSON-Datei auswählen. Das ersetzt den lokalen Stand. Die Datei enthält den Stand ihres angezeigten Sicherungszeitpunkts; spätere Aktionen fehlen.
4. Teamgeräte und Gäste scannen die **lokalen** QR-Codes neu. Cloud und Laptop synchronisieren sich nicht automatisch. Nach dem Wechsel die Show lokal fortsetzen.
5. Jeder bestätigte lokale Schritt wird atomar in `.local/game.json` gespeichert. Server-Neustart lädt diesen Stand wieder. Nicht gleichzeitig zwei lokale Server mit derselben Datei starten. Im Zweifel die Datei zusätzlich kopieren.

Die Tests verwenden eigene temporäre Spielstände und verändern diese Datei nicht.

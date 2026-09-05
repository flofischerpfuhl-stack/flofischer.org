export const PLACES = [
  { id: "col", name: "Kolosseum", detail: "Rom, Italien", lat: 41.8902, lng: 12.4922 },
  { id: "eif", name: "Eiffelturm", detail: "Paris, Frankreich", lat: 48.8584, lng: 2.2945 },
  { id: "lib", name: "Freiheitsstatue", detail: "New York, USA", lat: 40.6892, lng: -74.0445 },
  { id: "ben", name: "Big Ben", detail: "London, Großbritannien", lat: 51.5007, lng: -0.1246 },
  { id: "taj", name: "Taj Mahal", detail: "Agra, Indien", lat: 27.1751, lng: 78.0421 },
  { id: "syd", name: "Oper von Sydney", detail: "Sydney, Australien", lat: -33.8568, lng: 151.2153 },
  { id: "mac", name: "Machu Picchu", detail: "Peru", lat: -13.1631, lng: -72.545 },
  { id: "akr", name: "Akropolis", detail: "Athen, Griechenland", lat: 37.9715, lng: 23.7267 },
  { id: "pet", name: "Petersdom", detail: "Vatikanstadt", lat: 41.9022, lng: 12.4539 },
  { id: "neu", name: "Schloss Neuschwanstein", detail: "Bayern, Deutschland", lat: 47.5576, lng: 10.7498 },
  { id: "rio", name: "Cristo Redentor", detail: "Rio de Janeiro, Brasilien", lat: -22.9519, lng: -43.2105 },
  { id: "pyr", name: "Pyramiden von Gizeh", detail: "Gizeh, Ägypten", lat: 29.9792, lng: 31.1342 },
];

const melodies = {
  ode: { tempo: 132, notes: [["E4",1],["E4",1],["F4",1],["G4",1],["G4",1],["F4",1],["E4",1],["D4",1],["C4",1],["C4",1],["D4",1],["E4",1],["E4",1.5],["D4",.5],["D4",2]] },
  mendelssohn: { tempo: 112, notes: [["C4",1],["F4",.75],["F4",.25],["F4",1],["C4",1],["G4",.75],["E4",.25],["F4",2],["C4",1],["F4",.75],["A4",.25],["C5",1],["A4",1],["F4",2]] },
  elise: { tempo: 120, notes: [["E5",.5],["D#5",.5],["E5",.5],["D#5",.5],["E5",.5],["B4",.5],["D5",.5],["C5",.5],["A4",1],["R",.5],["C4",.5],["E4",.5],["A4",.5],["B4",1]] },
  mozart: { tempo: 140, notes: [["G4",.5],["D5",.5],["G5",1],["D5",1],["G5",1],["D5",.5],["G5",.5],["B5",.5],["D6",.5],["C6",1],["A5",1],["C6",1],["A5",.5],["C6",.5]] },
  donau: { tempo: 102, notes: [["C4",1],["E4",1],["G4",2],["G4",1],["R",1],["G4",1],["R",1],["E5",1],["R",1],["E5",1],["R",1],["C5",2],["G4",2]] },
  wagner: { tempo: 104, notes: [["Bb4",1],["D5",1],["F5",1.5],["Eb5",.5],["D5",1],["F5",1],["Bb5",2],["A5",1],["G5",1],["F5",2]] },
};

const musicRounds = [
  { prompt: "Titel oder Komponist?", answer: "Ode an die Freude – Ludwig van Beethoven", media: "melody", melody: melodies.ode },
  { prompt: "Welches berühmte Hochzeitsstück ist das?", answer: "Hochzeitsmarsch – Felix Mendelssohn", media: "melody", melody: melodies.mendelssohn },
  { prompt: "Wie heißt dieses Klavierstück?", answer: "Für Elise – Ludwig van Beethoven", media: "melody", melody: melodies.elise },
  { prompt: "Welches Mozart-Stück beginnt so?", answer: "Eine kleine Nachtmusik – Wolfgang Amadeus Mozart", media: "melody", melody: melodies.mozart },
  { prompt: "Welcher Walzer ist gesucht?", answer: "An der schönen blauen Donau – Johann Strauss", media: "melody", melody: melodies.donau },
];

const photoRounds = [
  { prompt: "Welches Hochzeitsmotiv steckt in diesem winzigen Ausschnitt?", answer: "Eheringe", media: "photo", sprite: { column: 0, row: 0 }, detail: { scale: 5.2, x: 30, y: 72 } },
  { prompt: "Welches Hochzeitsmotiv steckt in diesem winzigen Ausschnitt?", answer: "Sektkorken mit Agraffe", media: "photo", sprite: { column: 1, row: 0 }, detail: { scale: 5.4, x: 61, y: 54 } },
  { prompt: "Welches Hochzeitsmotiv steckt in diesem winzigen Ausschnitt?", answer: "Brautschleier aus Spitze", media: "photo", sprite: { column: 2, row: 0 }, detail: { scale: 5.7, x: 72, y: 34 } },
  { prompt: "Welches Hochzeitsmotiv steckt in diesem winzigen Ausschnitt?", answer: "Fliege", media: "photo", sprite: { column: 0, row: 1 }, detail: { scale: 5.6, x: 82, y: 18 } },
  { prompt: "Welches Hochzeitsmotiv steckt in diesem winzigen Ausschnitt?", answer: "Hochzeitstorte", media: "photo", sprite: { column: 1, row: 1 }, detail: { scale: 5.5, x: 22, y: 66 } },
];

const plateRounds = [
  { prompt: "Zu welcher Stadt oder welchem Landkreis gehört dieses Kennzeichen?", answer: "Ansbach", media: "plate", asset: "/media/plate-01.svg" },
  { prompt: "Zu welcher Stadt oder welchem Landkreis gehört dieses Kennzeichen?", answer: "Fürth", media: "plate", asset: "/media/plate-02.svg" },
  { prompt: "Zu welcher Stadt oder welchem Landkreis gehört dieses Kennzeichen?", answer: "Heidenheim an der Brenz", media: "plate", asset: "/media/plate-03.svg" },
  { prompt: "Zu welcher Stadt oder welchem Landkreis gehört dieses Kennzeichen?", answer: "Weißenburg-Gunzenhausen", media: "plate", asset: "/media/plate-04.svg" },
  { prompt: "Zu welcher Stadt oder welchem Landkreis gehört dieses Kennzeichen?", answer: "Main-Tauber-Kreis", media: "plate", asset: "/media/plate-05.svg" },
];

const quizRounds = [
  { prompt: "Wie viele Herzen hat ein Oktopus?", answer: "Drei", media: "question" },
  { prompt: "Welcher Planet ist der Sonne am nächsten?", answer: "Merkur", media: "question" },
  { prompt: "Wie heißt die Hauptstadt von Australien?", answer: "Canberra", media: "question" },
  { prompt: "Welches chemische Element hat das Symbol Au?", answer: "Gold", media: "question" },
  { prompt: "Wie viele Minuten hat ein Tag?", answer: "1.440", media: "question" },
];

const quizTieBreak = [
  { prompt: "Wie viele Kilometer sind es ungefähr einmal um den Äquator?", answer: "40.075 km", media: "question" },
  { prompt: "In welchem Jahr fiel die Berliner Mauer?", answer: "1989", media: "question" },
];

export const CARDS = [
  {
    id: "aktion-1", cat: "Aktion", stars: 1, kind: "physical", mode: "stopwatch", title: "Klopapier aufwickeln",
    text: "Zwei identische Papierstreifen, ein direktes Rennen: Wer wickelt zuerst sauber bis zum letzten Blatt auf?",
    setup: ["Je Team 30 zusammenhängende Blätter aus derselben Packung", "Identische leere Papprollen und gleiche Startlinie", "Ein Spieler pro Team; Rollen werden gleichzeitig freigegeben"],
    rules: ["Nur die Papprolle drehen; nicht am Papier ziehen oder es zusammenknüllen", "Reißt das Papier, wird am losen Ende weitergemacht", "Fertig gilt erst nach Sichtprüfung: alles Papier kompakt auf der Rolle"],
    decision: "Schnellere gültige Rolle gewinnt. Bei gleichzeitigem Ziel: eine kurze Stechrunde mit zehn Blättern.",
  },
  {
    id: "aktion-2", cat: "Aktion", stars: 2, kind: "physical", mode: "team-relay", target: 10, unit: "Personen", title: "Hemd-Staffel",
    text: "Zehn Personen pro Team ziehen dasselbe Hemd nacheinander vollständig an und wieder aus.",
    setup: ["Je Team zehn Personen in fester Reihenfolge und ein passend großes, vollständig aufgeknöpftes Hemd", "Je Team genau eine feste Hilfsperson bestimmen; sie darf während der gesamten Staffel helfen", "Teams absolvieren ihre Läufe nacheinander; Hemd und Startzustand sind identisch"],
    rules: ["Person 1 beginnt, danach folgen 2 bis 10 ohne Auslassen oder Parallelwechsel", "Vollständig angezogen heißt: beide Arme in den Ärmeln, Hemd am Oberkörper und die drei markierten Knöpfe geschlossen", "Erst nach vollständigem Ausziehen und Übergabe darf die nächste Person beginnen; außer der festen Hilfsperson hilft niemand"],
    decision: "Die kürzere Gesamtzeit für zehn vollständige Durchgänge gewinnt. Bei exakt gleicher Zeit folgt ein Durchgang pro Team als Stechen.",
  },
  {
    id: "aktion-3", cat: "Aktion", stars: 3, kind: "physical", mode: "stopwatch", title: "Tempo-Box leer",
    text: "Eine volle Taschentuchbox nur mit der schwachen Hand leeren.",
    setup: ["Zwei identische Boxen mit gleicher, vorab geprüfter Tuchzahl", "Boxen rutschfest befestigen; Auffangbehälter und freie Fläche", "Ein Spieler pro Team; starke Hand liegt auf der gegenüberliegenden Schulter"],
    rules: ["Nur ein Tuch pro Griff; mehrere auf einmal zählen als Fehlversuch", "Nur die schwache Hand berührt Box und Tücher", "Fertig gilt erst nach Sichtprüfung der leeren Box"],
    decision: "Die zuerst sichtbar leere Box gewinnt.",
  },
  {
    id: "aktion-4", cat: "Aktion", stars: 4, kind: "physical", mode: "team-relay", target: 40, unit: "Liegestütze", trackProgress: false, title: "Liegestütz-Staffel",
    text: "Beide Teams absolvieren nacheinander je 40 gültige Liegestütze gegen die Stoppuhr.",
    setup: ["Rutschfeste Matte und identischer Schaumstoff-Zielblock", "Gleiche Teamgröße; Standard- oder Knievariante vorher gemeinsam festlegen", "Eine neutrale Person zählt bei beiden Läufen; Teilnahme freiwillig"],
    rules: ["Oben Arme strecken, unten Brust an den Zielblock; Körperlinie halten", "Genau eine Person ist aktiv; Wechsel erst nach vollständiger Wiederholung und Abklatschen", "Bei Schmerz oder Schwindel sofort abbrechen; die Uhr stoppt bei der 40. gültigen Wiederholung"],
    decision: "Die kürzere Zeit bis zur 40. gültigen Wiederholung gewinnt. Bei exakt gleicher Zeit: zehn weitere Wiederholungen pro Team.",
  },
  {
    id: "aktion-5", cat: "Aktion", stars: 5, kind: "physical", mode: "pullups", title: "Klimmzüge",
    text: "Je zwei freiwillige Personen pro Team sammeln in je einem zusammenhängenden Versuch gültige Klimmzüge.",
    setup: ["Fest montierte, freigegebene Stange mit ausreichender Traglast; keine Klemmstange", "Matte, sicherer Aufstieg und Spotter; Schmuck und Uhren ab", "Zwei Personen pro Team; ausgeloste, abwechselnde Reihenfolge und gleiche Griffart"],
    rules: ["Kontrollierter Start, Kinn klar über die Stange, unten Arme nahezu strecken", "Kein Abspringen, Kipping oder starker Beinschwung; Bodenkontakt beendet den Versuch", "Teilnahme freiwillig; bei Schmerz oder Schwindel sofortiger Sicherheitsabbruch"],
    decision: "Die höhere Team-Summe gewinnt. Bei Gleichstand: längeres Halten mit Kinn über der Stange.",
  },
  {
    id: "party-1", cat: "Party", stars: 1, kind: "physical", mode: "stopwatch", title: "Wasser-Transfer",
    text: "150 ml stilles Wasser nur mit einem Löffel in einen Messbecher übertragen.",
    setup: ["Je Team identischer unzerbrechlicher Becher, Esslöffel und Messbecher", "Je 150 ml stilles Wasser; Tablett und Handtuch unterlegen", "Trockene, freie Standfläche; kein Alkohol und kein Trinken"],
    rules: ["Ausgangsbecher nicht anheben oder ausgießen", "Nur mit dem Löffel übertragen", "Fertig: Ausgangsbecher leer und mindestens 140 ml im Messbecher"],
    decision: "Das erste gültige Team gewinnt. Gleichstand: Stechen mit 30 ml.",
  },
  {
    id: "party-2", cat: "Party", stars: 2, kind: "physical", mode: "team-rounds", durationMs: 60000, title: "Hochzeits-Pantomime",
    text: "Jedes Team hat 60 Sekunden für bis zu sechs pantomimisch dargestellte Hochzeitsbegriffe.",
    setup: ["Die Website hält je Team sechs Begriffe bereit; keine Papierkarten nötig", "Team Kathi spielt zuerst, danach Team Anton; nur die darstellende Person sieht den Begriff bei der Moderation", "Eine darstellende Person je Team, die anderen im eigenen Team raten"],
    rules: ["Nicht sprechen, buchstabieren, Geräusche machen oder auf Gegenstände zeigen", "60 Sekunden pro Team insgesamt; Überspringen ist jederzeit ohne Punkt möglich", "Nur vollständig genannte Begriffe vor Ablauf der Zeit zählen; bei null ist Schluss"],
    decision: "Mehr richtig erratene Begriffe gewinnt. Bei Gleichstand erhält kein Team Punkte.",
    termSets: {
      rosa: ["Brautstrauß werfen", "Hochzeitstorte anschneiden", "Ehering anstecken", "Eröffnungstanz", "Sektkorken knallen", "Schleier tragen"],
      blau: ["Heiratsantrag", "Braut über die Schwelle tragen", "Hochzeitsfoto machen", "Kirchenglocken läuten", "Geschenk auspacken", "Fliege binden"],
    },
  },
  {
    id: "party-3", cat: "Party", stars: 3, kind: "physical", mode: "measurement", title: "Die perfekte Hälfte",
    text: "Jedes Team teilt denselben Gegenstand möglichst exakt in zwei gleich schwere Hälften.",
    setup: ["Zwei verdeckt auf gleiches Gesamtgewicht vorbereitete weiche Portionen", "Tarierte Küchenwaage und identische sichere Unterlagen", "Kunststoff-Teiler statt scharfem Messer"],
    rules: ["20 Sekunden betrachten, dann gleichzeitig genau einmal teilen", "Vorher nicht wiegen, markieren, abmessen, knicken oder nachschneiden", "Beide Teile werden einzeln gewogen"],
    decision: "Die kleinere prozentuale Gewichtsabweichung gewinnt; die Website berechnet und wertet automatisch.",
  },
  {
    id: "party-4", cat: "Party", stars: 4, kind: "physical", mode: "performance", audienceDecision: true, voteQuestion: "Welcher Witz war lustiger?", title: "Der beste Witz",
    text: "Je eine Person pro Team erzählt dem Publikum einen Witz.",
    setup: ["Pro Team eine freiwillige erzählende Person bestimmen", "Team Kathi erzählt zuerst, danach Team Anton", "Der öffentliche Gäste-QR darf schon vor dem ersten Witz gescannt werden"],
    rules: ["Je Team genau ein Witz und höchstens 60 Sekunden", "Keine privaten, diskriminierenden oder bloßstellenden Inhalte", "Abgestimmt wird erst, nachdem beide Witze vollständig erzählt wurden"],
    decision: "Die geheime Publikumsabstimmung über den öffentlichen Gäste-QR entscheidet. Bei Stimmengleichheit gibt es keine Punkte.",
  },
  {
    id: "party-5", cat: "Party", stars: 5, kind: "physical", mode: "countdown", durationMs: 180000, audienceDecision: true, title: "Klopapier-Brautkleid",
    text: "Drei Minuten: Ein Teammitglied wird zum tragbaren Hochzeitslook gestylt.",
    setup: ["Identische verschlossene Materialsets; keine Nadeln, Klammern oder scharfen Werkzeuge", "Je ein freiwilliges, vollständig bekleidetes Model und gleich viele Designer", "Trockene freie Fläche ohne offene Flammen; Laufstegreihenfolge auslosen"],
    rules: ["Gesicht, Hals, Atemwege und Brustkorb nie einengen; kein Klebeband auf Haut oder Haar", "Bei null sofort Hände weg; Arme und Beine bleiben beweglich", "Nur nach Sicherheitscheck: zehn Sekunden stabil stehen und sicher einige Schritte gehen"],
    decision: "Die geheime Publikumsabstimmung über den öffentlichen Gäste-QR bewertet Idee, Ausführung und Laufstegmoment.",
  },
  {
    id: "raten-1", cat: "Raten", stars: 1, kind: "quiz", title: "Lieder raten",
    text: "Fünf lokal erzeugte Melodie-Intros. Pro Runde kann jedes Team einen Punkt holen.",
    rounds: musicRounds,
    tieBreak: [{ prompt: "Stechen: Welches Hochzeitsstück ist das?", answer: "Brautchor – Richard Wagner", media: "melody", melody: melodies.wagner }],
  },
  {
    id: "raten-2", cat: "Raten", stars: 2, kind: "quiz", title: "Foto raten",
    text: "Fünf extrem kleine, bewusst schwer gewählte Hochzeitsdetails. Nach der Antwort wird das vollständige Motiv aufgedeckt.",
    rounds: photoRounds,
    tieBreak: [{ prompt: "Stechen: Was ist im Detail zu sehen?", answer: "Brautstrauß", media: "photo", sprite: { column: 2, row: 1 } }],
  },
  {
    id: "raten-3", cat: "Raten", stars: 3, kind: "quiz", title: "Nummernschilder",
    text: "Fünf weniger geläufige, realistisch gestaltete Kennzeichen nacheinander. Gesucht ist jeweils Stadt oder Landkreis.",
    rounds: plateRounds,
    tieBreak: [{ prompt: "Stechen: Welcher Landkreis ist gesucht?", answer: "Ostallgäu", media: "plate", asset: "/media/plate-06.svg" }],
  },
  {
    id: "raten-4", cat: "Raten", stars: 4, kind: "map", roundCount: 3, title: "Wo liegt das?",
    text: "Drei Sehenswürdigkeiten, drei verdeckte Pins pro Team. Rundensiege, danach Gesamtdistanz, entscheiden.",
  },
  {
    id: "raten-5", cat: "Raten", stars: 5, kind: "quiz", title: "Quiz-Blitz",
    text: "Fünf schnelle Wissensfragen. Bei Gleichstand entscheidet eine Stechfrage per Zuruf; die Moderation entscheidet, wer zuerst dran war.",
    rounds: quizRounds,
    tieBreak: [quizTieBreak[0]],
  },
  { id: "vote-1", cat: "Abstimmung", stars: 1, kind: "vote", guessMode: "percentage", title: "Heute lieber Wein oder Bier?", a: "Wein", b: "Bier", minVotes: 3, durationMs: 30000, text: "Beide Teams schätzen verdeckt den prozentualen Wein-Anteil; dann stimmen die Gäste einmal pro Gerät." },
  { id: "vote-2", cat: "Abstimmung", stars: 2, kind: "vote", guessMode: "percentage", title: "Nächster Urlaub: Berge oder Meer?", a: "Berge", b: "Meer", minVotes: 3, durationMs: 30000, text: "Beide Teams schätzen verdeckt den prozentualen Berge-Anteil." },
  { id: "vote-3", cat: "Abstimmung", stars: 3, kind: "vote", guessMode: "percentage", title: "Auf Hochzeiten: feiern oder plaudern?", a: "Auf der Tanzfläche feiern", b: "In Ruhe plaudern", minVotes: 3, durationMs: 30000, text: "Beide Teams schätzen verdeckt den prozentualen Tanzflächen-Anteil." },
  { id: "vote-4", cat: "Abstimmung", stars: 4, kind: "vote", guessMode: "percentage", title: "Zehn Jahre: Stadt oder Land?", a: "Pulsierende Stadt", b: "Ruhiges Land", minVotes: 3, durationMs: 30000, text: "Beide Teams schätzen geheim den prozentualen Stadt-Anteil. Die kleinere Abweichung gewinnt." },
  { id: "vote-5", cat: "Abstimmung", stars: 5, kind: "vote", guessMode: "percentage", title: "Team Hund oder Team Katze?", a: "Team Hund", b: "Team Katze", minVotes: 3, durationMs: 30000, text: "Beide Teams schätzen geheim nur den prozentualen Hunde-Anteil. Die kleinere Abweichung gewinnt." },
];

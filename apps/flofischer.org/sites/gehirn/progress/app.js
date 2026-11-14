"use strict";

// Darstellung der Roadmap. Alle Inhalte stehen in roadmap.json (Schema: PFLEGE.md).

const STAENDE = {
  fertig: "fertig",
  laeuft: "läuft",
  haengt: "hängt",
  offen: "offen",
  unklar: "unklar",
};
const BREIT = window.matchMedia("(min-width: 960px)");

let daten = null;
const knoten = new Map(); // id → Knoten
const nachfolger = new Map(); // id → ids, die daran hängen
let gewaehlt = null;

// ---------- Hilfen ----------

function el(tag, attrs, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kind of kinder.flat()) {
    if (kind === undefined || kind === null || kind === false) continue;
    e.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return e;
}

function marke(stand) {
  const s = STAENDE[stand] ? stand : "unklar";
  return el("span", { class: `marke s-${s}` }, STAENDE[s]);
}

function florianMarke(text) {
  return el("span", { class: "florian-marke", title: text || "Wartet auf Florian" }, "Florian gefragt");
}

function vorfahren(id, menge = new Set()) {
  for (const dep of knoten.get(id)?.haengtAn || []) {
    if (menge.has(dep) || !knoten.has(dep)) continue;
    menge.add(dep);
    vorfahren(dep, menge);
  }
  return menge;
}

// Ziele zählen die Teilziele aller Bausteine darunter.
function teilzieleVon(n) {
  if (!n.ziel) return n.teilziele || [];
  return [...vorfahren(n.id)].flatMap((id) => knoten.get(id).teilziele || []);
}

function zaehle(teilziele) {
  const z = { gesamt: teilziele.length, fertig: 0, laeuft: 0 };
  for (const t of teilziele) {
    if (t.stand === "fertig") z.fertig++;
    else if (t.stand === "laeuft") z.laeuft++;
  }
  return z;
}

function braeuchtFlorian(n) {
  if (n.florian) return true;
  return (n.teilziele || []).some((t) => t.florian);
}

function balken(n) {
  const z = zaehle(teilzieleVon(n));
  if (!z.gesamt) return null;
  const pf = (100 * z.fertig) / z.gesamt;
  const pl = (100 * z.laeuft) / z.gesamt;
  return el(
    "div",
    { class: "balken-zeile" },
    el(
      "div",
      {
        class: "balken",
        role: "img",
        "aria-label": `${z.fertig} von ${z.gesamt} Teilzielen fertig, ${z.laeuft} laufen`,
      },
      el("span", { class: "b-fertig", style: `width:${pf}%` }),
      el("span", { class: "b-laeuft", style: `width:${pl}%` })
    ),
    el("span", { class: "anteil" }, `${z.fertig}/${z.gesamt}`)
  );
}

function standText(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return [`Stand: ${iso || "unbekannt"}`];
  const datum = d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric", year: "numeric" });
  const zeit = iso.includes("T") ? `, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr` : "";
  const tage = Math.floor((Date.now() - d.getTime()) / 86400000);
  const teile = [`Stand vom ${datum}${zeit}`];
  if (tage >= 3) teile.push(" · ", el("span", { class: "alt" }, `seit ${tage} Tagen nicht aktualisiert`));
  return teile;
}

// ---------- Prüfung der Daten ----------

function pruefe(d) {
  const probleme = [];
  const ids = new Set();
  for (const n of d.knoten || []) {
    if (!n.id) probleme.push(`Knoten ohne id: „${n.titel}“`);
    if (ids.has(n.id)) probleme.push(`id doppelt: ${n.id}`);
    ids.add(n.id);
    if (!STAENDE[n.stand]) probleme.push(`${n.id}: unbekannter Stand „${n.stand}“`);
    for (const t of n.teilziele || []) {
      if (!STAENDE[t.stand]) probleme.push(`${n.id} › ${t.titel}: unbekannter Stand „${t.stand}“`);
    }
  }
  for (const n of d.knoten || []) {
    for (const dep of n.haengtAn || []) {
      if (!ids.has(dep)) probleme.push(`${n.id} hängt an unbekanntem Knoten „${dep}“`);
    }
  }
  const bereiche = new Set((d.bereiche || []).map((b) => b.id));
  for (const n of d.knoten || []) {
    if (!bereiche.has(n.bereich)) probleme.push(`${n.id}: unbekannter Bereich „${n.bereich}“`);
  }
  return probleme;
}

function hatKreis(id, pfad = new Set()) {
  if (pfad.has(id)) return true;
  pfad.add(id);
  for (const dep of knoten.get(id)?.haengtAn || []) {
    if (knoten.has(dep) && hatKreis(dep, pfad)) return true;
  }
  pfad.delete(id);
  return false;
}

// ---------- Detailinhalt (Seitenleiste und Baum) ----------

function detailInhalt(n, { mitVerweisen }) {
  const teile = [];
  teile.push(el("p", { class: "d-kurz" }, n.kurz || ""));
  if (n.blocker) teile.push(el("p", { class: "d-blocker" }, el("b", {}, "Woran es gerade hängt"), n.blocker));
  if (n.florian) teile.push(el("p", { class: "d-florian" }, el("b", {}, "Florian gefragt: "), n.florian));

  if (n.ziel) {
    const ids = [...vorfahren(n.id)];
    teile.push(el("div", { class: "d-gruppe" }, `Alle ${ids.length} Bausteine darunter`));
    teile.push(
      el(
        "ul",
        { class: "teilziele" },
        ids.map((id) => {
          const k = knoten.get(id);
          const z = zaehle(k.teilziele || []);
          return el(
            "li",
            {},
            el(
              "button",
              { type: "button", class: "tz-knopf", onclick: () => oeffne(id) },
              el("span", { class: "tz-titel" }, k.titel),
              marke(k.stand),
              el("span", { class: "tz-notiz" }, z.gesamt ? `${z.fertig} von ${z.gesamt} Teilzielen fertig` : "")
            )
          );
        })
      )
    );
  } else {
    let gruppe;
    let liste = null;
    for (const t of n.teilziele || []) {
      if (!liste || t.gruppe !== gruppe) {
        gruppe = t.gruppe;
        if (gruppe) teile.push(el("div", { class: "d-gruppe" }, gruppe));
        else if (!liste) teile.push(el("div", { class: "d-gruppe" }, "Teilziele"));
        liste = el("ul", { class: "teilziele" });
        teile.push(liste);
      }
      liste.append(
        el(
          "li",
          { class: t.stand === "fertig" ? "erledigt" : null },
          el("span", { class: "tz-titel" }, t.titel),
          marke(t.stand),
          t.notiz && el("span", { class: "tz-notiz" }, t.notiz),
          t.florian && el("span", { class: "tz-florian" }, `Florian gefragt: ${t.florian}`)
        )
      );
    }
  }

  if (mitVerweisen) {
    const chips = (ids) => ids.filter((id) => knoten.has(id)).map((id) => el("button", { type: "button", onclick: () => oeffne(id) }, knoten.get(id).titel));
    if (n.haengtAn?.length) teile.push(el("div", { class: "d-haengt" }, "Hängt an: ", el("br"), chips(n.haengtAn)));
    const nach = nachfolger.get(n.id) || [];
    if (nach.length) teile.push(el("div", { class: "d-haengt" }, "Wird gebraucht von: ", el("br"), chips(nach)));
  }
  return teile;
}

// ---------- Kopfbereich: Ziele, Fragen, Legende ----------

function zielKarte(n) {
  const z = zaehle(teilzieleVon(n));
  const unten = [...vorfahren(n.id)].map((id) => knoten.get(id));
  const laufen = unten.filter((k) => k.stand === "laeuft").length;
  const haengen = unten.filter((k) => k.stand === "haengt").length;
  const fragen = unten.filter(braeuchtFlorian).length + (n.florian ? 1 : 0);
  const direkt = (n.haengtAn || []).map((id) => knoten.get(id)?.titel).filter(Boolean);
  return el(
    "button",
    { type: "button", class: "zielkarte", onclick: () => oeffne(n.id) },
    el("h3", {}, n.titel),
    el("p", { class: "kette" }, direkt.length ? `hängt an ${direkt.join(", ")}` : n.kurz),
    balken(n),
    el(
      "div",
      { class: "zahlen" },
      el("span", {}, el("b", {}, z.fertig), ` von ${z.gesamt} Teilzielen fertig`),
      el("span", {}, el("b", {}, unten.length), " Bausteine"),
      laufen ? el("span", {}, el("b", {}, laufen), " laufen") : null,
      haengen ? el("span", {}, el("b", {}, haengen), " hängen") : null,
      fragen ? el("span", { class: "florian-marke" }, `${fragen}× Florian gefragt`) : null
    )
  );
}

function fragenListe() {
  const punkte = [];
  for (const n of knoten.values()) {
    if (n.florian) punkte.push({ id: n.id, wo: n.titel, was: n.florian });
    for (const t of n.teilziele || []) {
      if (t.florian) punkte.push({ id: n.id, wo: `${n.titel} › ${t.titel}`, was: t.florian });
    }
  }
  if (!punkte.length) return null;
  return [
    el("h2", { class: "abschnitt" }, `Florian ist gefragt (${punkte.length})`),
    el(
      "ul",
      { class: "fragen" },
      punkte.map((p) =>
        el(
          "li",
          {},
          el("button", { type: "button", onclick: () => oeffne(p.id) }, el("span", { class: "wo" }, p.wo), el("span", { class: "was" }, p.was))
        )
      )
    ),
  ];
}

function legende() {
  return el(
    "ul",
    { class: "legende", "aria-label": "Legende" },
    Object.keys(STAENDE).map((s) => el("li", {}, marke(s))),
    el("li", {}, florianMarke()),
    el("li", { class: "stand" }, "Balken: grün fertig, blau läuft")
  );
}

// ---------- Graph (breite Fenster) ----------

function graphLayout(liste) {
  const imBereich = new Set(liste.map((n) => n.id));
  const deps = (n) => (n.haengtAn || []).filter((id) => imBereich.has(id));
  const nach = (n) => (nachfolger.get(n.id) || []).filter((id) => imBereich.has(id));

  const tiefe = new Map();
  const berechne = (n, stapel = new Set()) => {
    if (tiefe.has(n.id)) return tiefe.get(n.id);
    if (stapel.has(n.id)) return 0;
    stapel.add(n.id);
    const t = deps(n).length ? 1 + Math.max(...deps(n).map((id) => berechne(knoten.get(id), stapel))) : 0;
    stapel.delete(n.id);
    tiefe.set(n.id, t);
    return t;
  };
  liste.forEach((n) => berechne(n));
  const maxSpalte = Math.max(0, ...tiefe.values());
  for (const n of liste) if (n.ziel) tiefe.set(n.id, maxSpalte);
  // Grundlagen ohne Vorgänger rücken direkt vor ihren frühesten Nutzer.
  for (const n of liste) {
    if (deps(n).length || n.ziel || !nach(n).length) continue;
    tiefe.set(n.id, Math.max(0, Math.min(...nach(n).map((id) => tiefe.get(id))) - 1));
  }

  const spalten = Array.from({ length: maxSpalte + 1 }, () => []);
  liste.forEach((n) => spalten[tiefe.get(n.id)].push(n));
  const zeilen = Math.max(...spalten.map((s) => s.length));
  const zeile = new Map();
  spalten.forEach((spalte) => {
    const schwer = (n) => {
      const r = deps(n).map((id) => zeile.get(id)).filter((v) => v !== undefined);
      return r.length ? r.reduce((a, b) => a + b, 0) / r.length : Infinity;
    };
    spalte
      .map((n, i) => ({ n, i, s: schwer(n) }))
      .sort((a, b) => (a.s === b.s ? a.i - b.i : a.s - b.s))
      .forEach(({ n }, i) => zeile.set(n.id, i + 1 + Math.floor((zeilen - spalte.length) / 2)));
  });
  return { spalte: tiefe, zeile, spalten: maxSpalte + 1, zeilen, deps };
}

function graph(liste) {
  const lay = graphLayout(liste);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "kanten");
  svg.setAttribute("aria-hidden", "true");
  const flaeche = el("div", {
    class: "graph-flaeche",
    style: `grid-template-columns: repeat(${lay.spalten}, minmax(150px, 1fr)); grid-template-rows: repeat(${lay.zeilen}, auto)`,
  });
  flaeche.append(svg);
  for (const n of liste) {
    flaeche.append(
      el(
        "button",
        {
          type: "button",
          class: `knoten st-${n.stand}${n.ziel ? " ziel" : ""}`,
          "data-id": n.id,
          style: `grid-column:${lay.spalte.get(n.id) + 1}; grid-row:${lay.zeile.get(n.id)}`,
          onclick: () => oeffne(n.id),
        },
        el("span", { class: "titel" }, n.titel),
        el("span", { class: "zeile" }, marke(n.stand), braeuchtFlorian(n) && florianMarke(n.florian)),
        balken(n)
      )
    );
  }
  const zeichne = () => kantenZeichnen(flaeche, svg, liste, lay.deps);
  new ResizeObserver(zeichne).observe(flaeche);
  return el("div", { class: "graph" }, el("div", { class: "graph-scroll" }, flaeche));
}

function kantenZeichnen(flaeche, svg, liste, deps) {
  const basis = flaeche.getBoundingClientRect();
  const box = (id) => flaeche.querySelector(`[data-id="${CSS.escape(id)}"]`)?.getBoundingClientRect();
  svg.replaceChildren();
  for (const n of liste) {
    const ziel = box(n.id);
    if (!ziel) continue;
    for (const dep of deps(n)) {
      const quelle = box(dep);
      if (!quelle) continue;
      const x1 = quelle.right - basis.left;
      const y1 = quelle.top + quelle.height / 2 - basis.top;
      const x2 = ziel.left - basis.left;
      const y2 = ziel.top + ziel.height / 2 - basis.top;
      const dx = Math.max(18, (x2 - x1) / 2);
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
      p.dataset.von = dep;
      p.dataset.nach = n.id;
      if (knoten.get(dep).stand === "fertig") p.classList.add("erfuellt");
      svg.append(p);
    }
  }
  markiereGraph();
}

function markiereGraph() {
  for (const f of document.querySelectorAll(".graph-flaeche")) {
    f.classList.toggle("gewaehlt", !!gewaehlt && !!f.querySelector(`[data-id="${CSS.escape(gewaehlt)}"]`));
  }
  const verwandt = new Set(gewaehlt ? [...(knoten.get(gewaehlt).haengtAn || []), ...(nachfolger.get(gewaehlt) || [])] : []);
  for (const k of document.querySelectorAll(".knoten")) {
    k.classList.toggle("gewaehlt", k.dataset.id === gewaehlt);
    k.classList.toggle("verwandt", verwandt.has(k.dataset.id));
  }
  for (const p of document.querySelectorAll(".kanten path")) {
    p.classList.toggle("aktiv", !!gewaehlt && (p.dataset.von === gewaehlt || p.dataset.nach === gewaehlt));
  }
}

// ---------- Kette (Handy) ----------

// Flache, aufklappbare Kette: Ziel zuerst, dann rückwärts, woran es hängt.
// Verschachteln würde die Karten am Handy zu schmal machen.

function baumKnoten(n) {
  const rumpfId = `rumpf-${n.id}`;
  const rumpf = el("div", { class: "baum-rumpf", id: rumpfId, hidden: true }, detailInhalt(n, { mitVerweisen: true }));
  const deps = (n.haengtAn || []).map((id) => knoten.get(id)?.titel).filter(Boolean);
  const kopf = el(
    "button",
    {
      type: "button",
      class: "baum-kopf",
      "aria-expanded": "false",
      "aria-controls": rumpfId,
      onclick: () => klappe(kopf, rumpf, rumpf.hidden),
    },
    el("span", { class: "titel" }, n.titel),
    el("span", { class: "pfeil", "aria-hidden": "true" }, "›"),
    el("span", { class: "zeile" }, marke(n.stand), braeuchtFlorian(n) && florianMarke(n.florian)),
    deps.length ? el("span", { class: "haengt-zeile" }, `hängt an ${deps.join(", ")}`) : null,
    balken(n)
  );
  return el("li", {}, el("div", { class: `baum-knoten st-${n.stand}${n.ziel ? " ziel" : ""}`, id: `b-${n.id}` }, kopf, rumpf));
}

function klappe(kopf, rumpf, auf) {
  rumpf.hidden = !auf;
  kopf.setAttribute("aria-expanded", auf ? "true" : "false");
}

function baum(liste) {
  const imBereich = new Set(liste.map((n) => n.id));
  const reihe = [];
  const gesehen = new Set();
  const warte = liste.filter((n) => n.ziel || !(nachfolger.get(n.id) || []).length);
  warte.sort((a, b) => (b.ziel ? 1 : 0) - (a.ziel ? 1 : 0));
  while (warte.length) {
    const n = warte.shift();
    if (gesehen.has(n.id)) continue;
    gesehen.add(n.id);
    reihe.push(n);
    for (const id of n.haengtAn || []) if (imBereich.has(id) && !gesehen.has(id)) warte.push(knoten.get(id));
  }
  for (const n of liste) if (!gesehen.has(n.id)) reihe.push(n);
  return el("ul", { class: "baum" }, reihe.map(baumKnoten));
}

function zeigeImBaum(id) {
  const kasten = document.getElementById(`b-${id}`);
  if (!kasten) return;
  klappe(kasten.querySelector(".baum-kopf"), kasten.querySelector(".baum-rumpf"), true);
  const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  kasten.scrollIntoView({ block: "start", behavior: ruhig ? "auto" : "smooth" });
  kasten.classList.remove("blitz");
  void kasten.offsetWidth;
  kasten.classList.add("blitz");
}

// ---------- Seitenleiste ----------

const detail = document.getElementById("detail");

function oeffne(id) {
  if (!knoten.has(id)) return;
  history.replaceState(null, "", `#${id}`);
  if (!BREIT.matches) {
    schliesse(false);
    zeigeImBaum(id);
    return;
  }
  const n = knoten.get(id);
  gewaehlt = id;
  document.getElementById("detail-titel").textContent = n.titel;
  document.getElementById("detail-rumpf").replaceChildren(
    el("div", { class: "zeile" }, marke(n.stand), braeuchtFlorian(n) && florianMarke(n.florian)),
    balken(n) || "",
    ...detailInhalt(n, { mitVerweisen: true })
  );
  detail.classList.add("offen");
  detail.setAttribute("aria-hidden", "false");
  detail.focus({ preventScroll: true });
  markiereGraph();
}

function schliesse(hashLoeschen = true) {
  if (!detail.classList.contains("offen")) return;
  detail.classList.remove("offen");
  detail.setAttribute("aria-hidden", "true");
  gewaehlt = null;
  if (hashLoeschen) history.replaceState(null, "", location.pathname + location.search);
  markiereGraph();
}

document.getElementById("detail-zu").addEventListener("click", () => schliesse());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") schliesse();
});
BREIT.addEventListener("change", () => schliesse(false));

// ---------- Aufbau ----------

function zeige(d) {
  daten = d;
  const inhalt = document.getElementById("inhalt");
  const probleme = pruefe(d);
  for (const n of d.knoten || []) knoten.set(n.id, n);
  for (const n of knoten.values()) {
    for (const dep of n.haengtAn || []) {
      if (!nachfolger.has(dep)) nachfolger.set(dep, []);
      nachfolger.get(dep).push(n.id);
    }
  }
  for (const id of knoten.keys()) if (hatKreis(id)) probleme.push(`Kreis in den Abhängigkeiten bei ${id}`);

  document.getElementById("stand").replaceChildren(...standText(d.standVom));
  const teile = [];
  if (probleme.length) {
    teile.push(el("div", { class: "fehler" }, el("b", {}, "Fehler in roadmap.json:"), el("ul", {}, probleme.map((p) => el("li", {}, p)))));
  }
  const ziele = [...knoten.values()].filter((n) => n.ziel);
  teile.push(el("h2", { class: "abschnitt" }, "Release-Ziele"), el("div", { class: "ziele" }, ziele.map(zielKarte)));
  teile.push(...(fragenListe() || []));
  teile.push(legende());
  for (const b of d.bereiche || []) {
    const liste = [...knoten.values()].filter((n) => n.bereich === b.id);
    if (!liste.length) continue;
    teile.push(
      el(
        "section",
        { class: "bereich", "aria-label": b.titel },
        el("div", { class: "bereich-kopf" }, el("h2", { class: "abschnitt" }, b.titel)),
        graph(liste),
        baum(liste)
      )
    );
  }
  inhalt.replaceChildren(...teile);

  const start = decodeURIComponent(location.hash.slice(1));
  if (knoten.has(start)) requestAnimationFrame(() => oeffne(start));
}

fetch("roadmap.json", { cache: "no-store" })
  .then((r) => {
    if (!r.ok) throw new Error(`roadmap.json: HTTP ${r.status}`);
    return r.json();
  })
  .then(zeige)
  .catch((err) => {
    document.getElementById("stand").textContent = "";
    document.getElementById("inhalt").replaceChildren(el("div", { class: "fehler" }, `Die Daten konnten nicht geladen werden (${err.message}).`));
  });

# flofischer.org

Persönliche Website von **Florian Fischer** — gesplittet in zwei Subdomains:

| Host | Thema | Stil |
|------|--------|------|
| [flofischer.org](https://flofischer.org) | Portal / Hub | Walkable Three.js landscape: blooming Seele / dystopian Gehirn |
| [seele.flofischer.org](https://seele.flofischer.org) | Katholische Apologetik (Blog) | Helles Editorial / botanische Lehrtafeln |
| [gehirn.flofischer.org](https://gehirn.flofischer.org) | Apps & Projekte | Dunkler anaglyphischer Sci-Fi-Look |

## Architektur

```
sites/
  root/          → flofischer.org
  seele/         → seele.flofischer.org   (Blog + posts/)
  gehirn/        → gehirn.flofischer.org  (Fernwork, SupraBench, Paper2Form)
  shared/        → globale CSS-Tokens
worker/index.js  → Host-basiertes Routing
```

Static HTML/CSS/JS + Cloudflare Worker (Assets Binding). Die Seele-Artikel werden aus den Markdown-Quellen als statische HTML-Fragmente erzeugt.
Deploy: Push auf `main` → GitHub Action → `wrangler deploy`.

Hub, Seele und Gehirn besitzen jeweils ein eigenes Web-App-Manifest, installierbare App-Icons und einen Service Worker. Canonicals, Open-Graph-/Twitter-Metadaten, Social-Cards, `robots.txt` und Sitemaps werden als Teil des statischen Releases ausgeliefert.

Artikel neu erzeugen:

```bash
python3 scripts/build-seele-content.py
python3 scripts/build-seele-pages.py
npm run audit
```

## Lokal

```bash
npm install
npm run dev          # wrangler dev — Routing inkl. /__seele /__gehirn
# oder:
npm run preview      # raw static tree auf :8787 (ohne Host-Routing)
```

Im lokalen Wrangler-Dev:

- Hub: `http://127.0.0.1:8787/`
- Seele: `http://127.0.0.1:8787/__seele/`
- Gehirn: `http://127.0.0.1:8787/__gehirn/`

## Cloudflare einrichten

### 1. API Token

Cloudflare Dashboard → **My Profile → API Tokens → Create Token**

Empfohlene Berechtigungen:

- Account · Workers Scripts · Edit
- Account · Account Settings · Read
- Zone · Zone · Read (Zone: `flofischer.org`)
- Zone · DNS · Edit (Zone: `flofischer.org`) — für Custom Domains / Routes

Account-ID: Dashboard rechte Sidebar auf der Overview-Seite.

### 2. Secrets in GitHub

Im Repo **Settings → Secrets and variables → Actions**:

| Secret | Wert |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | Token aus Schritt 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Account-ID |

### 3. Erster Deploy

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=…
npm run deploy
```

Oder: Push auf `main` (nach Secrets).

### 4. Domains

Die folgenden Worker Custom Domains sind deklarativ in `wrangler.jsonc` hinterlegt und werden beim Deploy angebunden:

- `flofischer.org`
- `www.flofischer.org`
- `seele.flofischer.org`
- `gehirn.flofischer.org`

Cloudflare legt dafür die benötigten DNS-Einträge an. Der API-Token benötigt deshalb `Zone · DNS · Edit` für `flofischer.org`; die Zone muss im selben Account aktiv sein wie der Worker.

## Projekte auf Gehirn

In dieser Reihenfolge:

- Fernwork (fernwork.net)
- SupraBench (suprabench.com)
- Paper2Form (paper2form.com)

HimmelCAD folgt, sobald eine eigene Website online ist.

## Designs

**Seele** nutzt einen festen, hellen Editorial-Look, botanisch-christliche Lehrtafeln, eine redaktionelle Volltextsuche und Themenfilter. Fünf zweisprachige Langtexte werden vollständig aus den versionierten Quellen im Repository gebaut. Die Sprachauswahl gilt domainübergreifend; ohne Auswahl folgt die Seite den Browsereinstellungen.

Der **Hub** ist eine kleine, dichte Three.js-Schwelle ohne Splash-Screen: links ein blühender Tagesgarten (Seele), rechts ein nächtlicher Tempelhof mit Kirschblüte und Neon (Gehirn). Nur Umschauen — Ziehen mit der Maus — und Klick auf eine Schwelle. **Gehirn** nutzt einen einzelnen dunklen, anaglyphischen Filmrollen-Look mit Weiß sowie gegeneinander verschobenen Rot- und Cyan-Kanälen. Die drei Projektflächen zeigen loopende Aufnahmen der echten Websites unter einer gemeinsamen visuellen Behandlung.

## Lizenz

Inhalt © Florian Fischer. Code in diesem Repo: MIT (siehe `LICENSE`), sofern nicht anders vermerkt.

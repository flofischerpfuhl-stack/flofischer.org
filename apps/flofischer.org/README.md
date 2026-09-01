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
Deploy: Push auf `main` → Cloudflare Workers Builds → `wrangler deploy`.

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

## Cloudflare-Deployment

Der Worker `flofischer` ist mit dem öffentlichen Monorepo verbunden. Cloudflare
baut ausschließlich Änderungen unter `apps/flofischer.org/` aus `main`; lokale
Deployments verwenden die normale Wrangler-Anmeldung. Zugangsdaten gehören
nicht in GitHub-Secrets oder in dieses Verzeichnis.

### Domains

Die folgenden Worker Custom Domains sind deklarativ in `wrangler.jsonc` hinterlegt und werden beim Deploy angebunden:

- `flofischer.org`
- `www.flofischer.org`
- `seele.flofischer.org`
- `gehirn.flofischer.org`

Cloudflare legt dafür die benötigten DNS-Einträge an. Die Zone und der Worker
liegen im selben Cloudflare-Konto.

## Projekte auf Gehirn

In dieser Reihenfolge:

- Fernwork (fernwork.net)
- SupraBench (suprabench.com)
- Paper2Form (paper2form.com)

HimmelCAD folgt, sobald eine eigene Website online ist.

## Designs

**Seele** nutzt einen festen, hellen Editorial-Look, botanisch-christliche Lehrtafeln, eine redaktionelle Volltextsuche und Themenfilter. Die fünf veröffentlichten zweisprachigen Langtexte werden vollständig aus den Markdown-Quellen unter `sites/shared/seele/source/` gebaut; der Build ist unabhängig von Obsidian und privaten Dateipfaden. Die Sprache wird domainübergreifend gespeichert und anhand der Browsersprache vorbelegt.

Der **Hub** besteht ausschließlich aus dem aktuellen Floating-Island-Diorama. Seele und Gehirn sind Bereiche derselben Insel; die früheren zwei separaten Three.js-Szenen und `/shared/hub/main.js` gehören nicht mehr zur Architektur. **Gehirn** nutzt einen einzelnen dunklen, anaglyphischen Filmrollen-Look mit Weiß sowie gegeneinander verschobenen Rot- und Cyan-Kanälen. Die drei Projektflächen zeigen loopende Aufnahmen der echten Websites unter einer gemeinsamen visuellen Behandlung.

## Lizenz

Inhalt © Florian Fischer. Code in diesem Repo: MIT (siehe `LICENSE`), sofern nicht anders vermerkt.

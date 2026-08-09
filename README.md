# flofischer.org

Persönliche Website von **Florian Fischer** — gesplittet in zwei Subdomains:

| Host | Thema | Stil |
|------|--------|------|
| [flofischer.org](https://flofischer.org) | Portal / Hub | Split Seele · Gehirn |
| [seele.flofischer.org](https://seele.flofischer.org) | Katholische Apologetik (Blog) | Weiß / Blau |
| [gehirn.flofischer.org](https://gehirn.flofischer.org) | Apps & Projekte | Weiß / Rot (Marlboro-inspiriert) |

## Architektur

```
sites/
  root/          → flofischer.org
  seele/         → seele.flofischer.org   (Blog + posts/)
  gehirn/        → gehirn.flofischer.org  (Fernwork, HimmelCAD, SupraBench, …)
  shared/        → globale CSS-Tokens
worker/index.js  → Host-basiertes Routing
```

Static HTML/CSS/JS + Cloudflare Worker (Assets Binding). Kein Build-Schritt.
Deploy: Push auf `main` → GitHub Action → `wrangler deploy`.

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

### 4. Domains anbinden

Nach dem ersten Deploy im Cloudflare Dashboard unter
**Workers & Pages → flofischer → Settings → Domains & Routes**:

- `flofischer.org`
- `www.flofischer.org`
- `seele.flofischer.org`
- `gehirn.flofischer.org`

DNS (wenn die Domain bereits auf Cloudflare liegt): Workers Custom Domain
legt die Records i. d. R. automatisch an. Alternativ manuell:

| Type | Name | Content |
|------|------|---------|
| CNAME / Worker route | `@`, `www`, `seele`, `gehirn` | Worker `flofischer` |

Zone muss Active auf demselben Account sein, in dem der Worker liegt.

## Öffentlich auf Gehirn

Nur **public** Repos / Live-Sites:

- SupraBench (suprabench.com)
- HimmelCAD public mirror
- Paper2Form Landingpage
- xivreview

Private Projekte (Fernwork, …) werden **nicht** gelistet.

## Designs (umschaltbar)

Unten auf jeder Seite: **Design 1–5** (Tasten `1`–`5`, speichert in `localStorage`).

| # | Name | Inspiration |
|---|------|-------------|
| 1 | **Atelier** | [Lydia Leiwang](https://lydialeiwang.com/) — Instrument Serif, cream, accent rules |
| 2 | **Producer** | [Khegai](https://khegai.com/) — Oswald caps, dark index |
| 3 | **Campus** | [Loyalist](https://loyalistcollege.com/) — bold flat color panels |
| 4 | **Catalog** | Marlboro display, museum labels |
| 5 | **Ink** | Literary journal, mono + serif |

Keine Gradienten. Private Projekte bleiben unsichtbar.

## Lizenz

Inhalt © Florian Fischer. Code in diesem Repo: MIT (siehe `LICENSE`), sofern nicht anders vermerkt.

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

## Gehirn — Projekt-Quellen auf dem Laptop

| Projekt | Pfad | Remote |
|---------|------|--------|
| Fernwork | `003_Projekte/17_fernwork` | github.com/flofischerpfuhl-stack/fernwork |
| HimmelCAD | `003_Projekte/10_himmelcad` | himmelcad / himmelcad-public |
| SupraBench | `003_Projekte/13_suprabench` | suprabench.com + GitHub |
| Kapelle Web | `003_Projekte/11_Kapelle Webseite` | — |
| Vermessung | `003_Projekte/18_Vermessung Webseite` | — |

## Seele — Text-Quellen

Aus `091_Software/32_Obsidian/`:

- Gottesbeweise, FSSPX-Verteidigung, Aliens und Katholizismus
- Antwort an Pater Kusmenko, Eucharistische Wunder, Vorsehung und freier Wille

Posts sind **Entwurfs-Exzerpte** — Volltext-Migration folgt.

## Stil

Display-Schrift: **Bebas Neue** (Marlboro-ähnliche, kondensierte Caps).  
Seele-Body: Source Serif 4. Gehirn-Body: Inter.  
Farben: Seele `#1a3a6b` / Gehirn `#c41230` auf Weiß.

## Lizenz

Inhalt © Florian Fischer. Code in diesem Repo: MIT (siehe `LICENSE`), sofern nicht anders vermerkt.

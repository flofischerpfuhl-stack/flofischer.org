# flofischer.org

Public monorepo for the websites below `flofischer.org`. Each hostname has its
own application directory and, when it becomes deployable, its own Cloudflare
Worker configuration. A change to one hostname must not deploy another one.

| Hostname | Source | Production |
| --- | --- | --- |
| `flofischer.org`, `www`, `seele`, `gehirn` | [`apps/flofischer.org`](apps/flofischer.org) | Cloudflare Worker `flofischer` |
| `hochzeit.flofischer.org` | [`apps/hochzeit.flofischer.org`](apps/hochzeit.flofischer.org) | Cloudflare Worker `hochzeit-spiele` |

## Deployment rules

- `main` is the production branch.
- Cloudflare Workers Builds runs inside the affected app directory.
- Build watch paths isolate applications in this monorepo.
- Every app owns its `wrangler.jsonc`, tests, assets, and lockfile.
- Runtime secrets are stored in Cloudflare, never in Git.
- Pull requests and pushes to `main` run the same unit, HTTP, privacy, and
  deployment dry-run checks in GitHub Actions.

For the main website, the Cloudflare build settings are:

- Root directory: `/apps/flofischer.org`
- Build command: `npm ci && npm run audit && npm run check:deploy`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`
- Included build path: `apps/flofischer.org/*`

For `hochzeit.flofischer.org`, the separate Cloudflare build settings are:

- Root directory: `/apps/hochzeit.flofischer.org`
- Build command: `npm ci && npm test && npm run check:deploy`
- Deploy command: `npx wrangler deploy`
- Production branch: `main`
- Included build path: `apps/hochzeit.flofischer.org/*`

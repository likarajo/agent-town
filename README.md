# Agent Town

A free, installable isometric town command center for a team of AI assistant bots.

Public visitors always see a labelled **sample / placeholder** town. Real GitHub activity loads only in the owner’s browser after pasting a fine-grained, read-only token into Settings (stored in that device’s `localStorage` only).

## Quick start

```bash
git clone https://github.com/likarajo/agent-town.git
cd agent-town
npm install
npm run dev
```

Open the URL Vite prints (assets are served under `/agent-town/`).

```bash
npm run build    # outputs dist/
npm run preview  # preview the production build
```

### Clone into Cursor (local)

1. In Cursor: **Clone repo** → `https://github.com/likarajo/agent-town.git`
2. Open the folder, run `npm install` then `npm run dev` in the terminal.
3. Use the cloud or local agent against a feature branch — never push app work to `main` without review.

## Enable GitHub Pages

1. Repo **Settings → Pages**
2. **Source**: GitHub Actions
3. Merge a PR that includes `.github/workflows/pages.yml` (this project), or run the workflow from the `main` branch after merge.
4. Site URL will be `https://<user>.github.io/agent-town/`

The Vite `base` is `/agent-town/` so asset paths work on the project Pages site.

## Install on an iPhone (Safari)

1. Open the Pages URL (or your local tunnel) in **Safari**.
2. Tap the Share button → **Add to Home Screen**.
3. Confirm the name **Agent Town**. The app opens standalone with safe-area insets.

On a laptop, use the browser’s install / “Add to Dock” affordance when the PWA criteria are met (manifest + service worker + icons).

## Privacy model

| Rule | Detail |
|------|--------|
| Public by default | Repo + Pages show town + **clearly labelled sample data** only |
| No secrets in git | Never commit tokens, real repo lists, PR titles, commits, wiki text, or personal info |
| Token | Optional fine-grained **read-only** GitHub PAT, pasted in Settings |
| Storage | Token + owner repo/wiki config live in **localStorage on that device only** |
| Network | Token is sent **only** to `https://api.github.com` |
| Forget | Settings → **Forget token** |
| Service worker | Caches the offline **shell** only — **never** GitHub API responses |
| Blocked wiki paths | Never fetch or display `immigration/`, `finance/`, or `health/` |
| Employer content | Out of scope — none in source or samples |

Owner repo / wiki mappings are editable in Settings and are **not** baked into the build. Source ships generic placeholders such as `your-user/sample-workshop`.

See [PLAN.md](./PLAN.md) for architecture, data model, and milestones.

## Milestone 1 (this skeleton)

- Canvas isometric town with all ten bots/buildings from `src/data/town.json`
- Pan, pinch-zoom, wheel zoom, tap → detail sheet (sample activity)
- Activity cues (lit windows / flags) from sample data
- Settings: save/forget token, edit local repo & wiki placeholders
- GitHub data layer interface (`sample` + gated `live` skeleton)
- PWA: manifest, service worker, icons, Apple meta tags
- GitHub Actions Pages workflow

## Bots (public roster)

| Bot | Role | Building |
|-----|------|----------|
| Theo | Software Engineer | Workshop |
| Paige | Brand & Publishing Lead | Print Shop |
| Ada | Research Lead | Lab |
| Hunter | Real Estate Advisor | Realty Office |
| Haven | Preparedness Planner | Supply Depot |
| Otto | Operations Lead | Town Hall |
| Warren | Financial Advisor | Bank |
| Ellis | Immigration Counsel | Consulate |
| Max | Health Coach | Gym |
| Grok | Assistant | Central Plaza |

## License

Source and original procedural art in this repository are available for personal use with the project. Do not commit secrets or private data.

# Agent Town — Plan

## Goals

Build a free, installable **command center** for a personal team of AI assistant bots, rendered as a small **2D isometric town** instead of a flat dashboard.

- **Zero cost**: static site only (no backend), hosted on GitHub Pages.
- **Installable PWA**: works on laptop browsers and iPhone (Safari Add to Home Screen).
- **Privacy-first**: the repo and public Pages site show **sample/placeholder data only**. Real GitHub activity loads only after the owner pastes a fine-grained, read-only token into a local settings screen.
- **Light runtime**: plain HTML, CSS, and TypeScript (Vite). Canvas isometric renderer. No heavy 3D engine.
- **Touch + mouse**: tap, pan, pinch-zoom, wheel zoom.

## Architecture

```
Browser (PWA)
├── Shell: index.html + CSS + service worker (offline shell only)
├── Town layer: canvas isometric map + camera (pan/zoom)
├── UI layer: building sheet, settings panel, privacy banners
├── Data layer:
│   ├── town.json — public bot roster (names, roles, building types, map coords)
│   ├── sample activity — placeholder PRs / commits / wiki snippets
│   └── GitHub client — interface + sample impl + live impl (token-gated)
└── Local device storage (localStorage only)
    ├── github token (never committed)
    └── owner repo / wiki section config (never baked into the build)
```

### Deploy

- Vite build with `base: '/agent-town/'` so assets resolve under the Pages project path.
- GitHub Actions workflow deploys `dist/` to GitHub Pages.
- Relative asset URLs; no absolute production CDN dependency.

### Rendering

- Single `<canvas>` isometric projector (`tileToScreen`).
- Procedural / SVG-inspired building glyphs drawn with 2D canvas paths (original art).
- Activity cues: lit windows, flag, or glow when sample/live data indicates open PRs or recent commits.

### Interaction

- Pointer events unified for mouse and touch.
- One-finger / left-drag pan; pinch or wheel zoom; tap opens a bottom sheet for that building.

## Data model

### `src/data/town.json` (public, committed)

One building per bot:

| id | name | role | building |
|----|------|------|----------|
| theo | Theo | Software Engineer | workshop |
| paige | Paige | Brand & Publishing Lead | print shop |
| ada | Ada | Research Lead | lab |
| hunter | Hunter | Real Estate Advisor | realty office |
| haven | Haven | Preparedness Planner | supply depot |
| otto | Otto | Operations Lead | town hall |
| warren | Warren | Financial Advisor | bank |
| ellis | Ellis | Immigration Counsel | consulate |
| max | Max | Health Coach | gym |
| grok | Grok | Assistant | central plaza |

Fields per building: `id`, `name`, `role`, `buildingType`, `label`, map `q`/`r` (axial), accent color, optional `wikiSection` **placeholder key** (generic label only — not a real path baked as private content).

### Activity (runtime)

```ts
interface BuildingActivity {
  buildingId: string;
  openPrs: { title: string; number: number; updatedAt: string; repoLabel: string }[];
  recentCommits: { message: string; sha: string; date: string; repoLabel: string }[];
  wikiExcerpt: { title: string; markdown: string } | null;
  cues: { hasOpenPrs: boolean; hasRecentCommits: boolean };
}
```

Repo labels in **sample** mode are clearly fake (`sample-repo-alpha`, etc.). Live mode uses repos the owner configured locally.

### Owner config (localStorage only)

```ts
interface OwnerConfig {
  /** Map buildingId → list of owner-configured repo full names (never committed). */
  reposByBuilding: Record<string, string[]>;
  /** Second-brain wiki repo full name, e.g. owner/second-brain (local only). */
  wikiRepo: string;
  /** Map buildingId → wiki section folder name under the wiki repo. */
  wikiSectionByBuilding: Record<string, string>;
}
```

Hard blocklist (never fetch or display): paths under `immigration/`, `finance/`, `health/`, `relationships/` (case-insensitive prefix match on requested wiki paths).

## Privacy model

| Concern | Rule |
|---------|------|
| Public site / repo | Only town + labelled sample/placeholder data |
| Real repo names, PR titles, commits, wiki text, personal info | Never committed; never baked into the build |
| Token | Fine-grained, read-only; pasted in Settings; stored in `localStorage` on that device only |
| Token egress | Sent only to `https://api.github.com` |
| Forget | Settings exposes **Forget token** (and optionally clear owner config) |
| Service worker | Must **never** cache GitHub API responses |
| Sensitive wiki paths | Do not fetch or display `immigration/`, `finance/`, `health/`, `relationships/` |
| Employer content | Out of scope — none in source or sample data |

Public UI must make sample mode obvious (banner / “Sample data” labels on sheets).

## GitHub data layer interface (designed in Milestone 1)

```ts
interface TownDataSource {
  mode: 'sample' | 'live';
  getActivity(buildingId: string): Promise<BuildingActivity>;
}
```

- `SampleDataSource` — always available; used when no token.
- `LiveGitHubDataSource` — constructed only when a token exists; talks to `api.github.com`; reads owner config from localStorage; enforces path blocklist.

Milestone 1 ships the interface + sample source + a live stub/skeleton that is wired but gated.

## Milestones

### Milestone 1 — Skeleton (this PR)

- [x] `PLAN.md`
- [ ] Vite + TypeScript app with canvas isometric town
- [ ] All ten buildings from `town.json`, tap → sheet with role + sample activity
- [ ] Pan / pinch-zoom / wheel
- [ ] Activity cues from sample data
- [ ] Settings UI: paste token, forget token, edit local repo/wiki placeholders
- [ ] PWA: manifest, service worker (shell only), icons, Apple meta, safe-area, standalone
- [ ] GitHub Pages Actions workflow (`/agent-town/` base)
- [ ] README: run locally, Cursor clone, enable Pages, iPhone install, privacy
- [ ] `npm run dev` and `npm run build` succeed

### Milestone 2 — Live GitHub wiring

- Implement live PR/commit fetches per configured repo.
- Fetch wiki markdown at `<section>/wiki/index.md` with blocklist enforcement.
- Rate-limit / error UX; token scope hints.

### Milestone 3 — Polish

- Richer building art, day/night cues, accessibility pass, offline town shell hardening.
- Optional export/import of owner config (still local; never auto-commit).

## Non-goals (near term)

- No server, no database, no auth proxy.
- No 3D engine, no native app store packaging.
- No scraping outside `api.github.com`.
- No employer-related content.

# Agent Town — Plan

## Goals

Build a free, installable **command center** for a personal team of AI assistant bots, rendered as a small **2D isometric town** instead of a flat dashboard.

- **Zero cost**: static site only (no backend), hosted on GitHub Pages; unsigned desktop builds from GitHub Actions.
- **Installable**: PWA on laptop browsers and iPhone (Safari Add to Home Screen), plus an Electron desktop app for Windows and macOS.
- **Privacy-first**: the repo and public Pages site show **sample bots and sample activity only**. The owner's roster and GitHub activity load only after a fine-grained, read-only token is saved locally (Settings on the web, `.env` on desktop).
- **Light runtime**: plain HTML, CSS, and TypeScript (Vite). Canvas isometric renderer. No heavy 3D engine.
- **Touch + mouse**: tap, pan, pinch-zoom, wheel zoom.

## Architecture

```
Browser (PWA) or Electron window
├── Shell: index.html + CSS + service worker (offline shell only; skipped on desktop)
├── Town layer: canvas isometric map + camera (pan/zoom)
├── UI layer: building sheet, settings panel, status banner
├── Data layer:
│   ├── town/catalog.ts — constants: ground, architectures (label, accent, home plot), spare plots, placeholder grey
│   ├── sample-roster.md — made-up public roster, parsed like a real one
│   ├── roster loader — fetches + parses the owner's roster (token-gated)
│   └── activity sources — sample impl + live GitHub impl (token-gated)
└── Local settings
    ├── web: localStorage (token, second-brain repo, roster URL)
    └── desktop: `.env` next to the app, exposed by the preload script
```

### Deploy

- Web: Vite build with `base: '/agent-town/'`; GitHub Actions deploys `dist/` to GitHub Pages.
- Desktop: `vite build --mode desktop` (relative `base`, `dist-desktop/`), packaged by electron-builder. The **Build desktop app** workflow (`.github/workflows/desktop.yml`) builds macOS (universal dmg/zip) and Windows (nsis/zip) artifacts.

### Rendering

- Single `<canvas>` isometric projector (`tileToScreen`).
- Procedural building glyphs drawn with 2D canvas paths (original art); unknown building types get a plain block, and anything that failed to load gets the grey placeholder block.
- Activity cues: lit windows for commits in the last 7 days, a flag for open PRs.

### Interaction

- Pointer events unified for mouse and touch.
- One-finger / left-drag pan; pinch or wheel zoom; tap opens a bottom sheet for that building.

## Data model

### Roster (Markdown)

The first Markdown table with a `Bot` column; other columns are optional and matched by header name.

| Column | Meaning |
|--------|---------|
| Bot | Name on the building (required) |
| Job | Shown under the name |
| Building | One of the `layout.json` building types; anything else becomes a plain, labelled building |
| Section | The bot's folder in the second-brain repo |
| Repos | Comma-separated `owner/name` repos for PRs and commits |

`buildTown` is a pure function of the roster, so every device draws the same town:

- A bot's architecture (look, colour, home plot) comes only from its own Building value, via the constants in `src/town/catalog.ts`; unknown values share one generic look.
- The earliest row with an architecture gets its home plot. Every other bot starts at a spare plot picked by hashing its id and takes the next free one, processed in id order, so reordering, adding or removing other rows doesn't move it unless two bots want the same spot. Then unclaimed home plots, then new columns east of the map.

### Placeholders

While a saved token's roster loads, or if it fails, the town shows grey stand-ins on every home plot (`placeholderTown`), never the sample bots. A bot whose activity fails to load is drawn with the same grey block. Hovering (or tapping) a grey building shows the reason.

### Activity (runtime)

```ts
interface BuildingActivity {
  buildingId: string;
  openPrs: { title: string; number: number; updatedAt: string; repoLabel: string; url?: string }[];
  recentCommits: { message: string; sha: string; date: string; repoLabel: string; url?: string }[];
  wikiExcerpt: { title: string; markdown: string } | null;
  cues: { hasOpenPrs: boolean; hasRecentCommits: boolean };
  isSample: boolean;
  error?: string;
}
```

Live activity per bot: open PRs and commits for up to three roster repos, commits under the bot's section of the second-brain repo, and that section's `index.md` (falling back to `wiki/index.md`). Results are cached in memory for the page load.

### Owner config (local only)

```ts
interface OwnerConfig {
  /** owner/name of the second-brain repo. */
  secondBrainRepo: string;
  /** GitHub file link to the roster, or a path inside the second-brain repo. */
  rosterUrl: string;
}
```

Every roster URL form (github.com blob, raw.githubusercontent.com, api.github.com contents, relative path) is fetched through `api.github.com`.

Settings are entered once and kept until **Reset all settings**: every save asks the browser for persistent storage (`navigator.storage.persist()`), and the desktop app flushes localStorage to disk on each save and on quit.

Hard blocklist (never fetch or display): paths under `immigration/`, `finance/`, `health/`, `relationships/` (case-insensitive prefix match on roster and section paths).

## Privacy model

| Concern | Rule |
|---------|------|
| Public site / repo | Only the sample roster and labelled sample activity |
| Owner's bots, repo names, PR titles, commits, wiki text, personal info | Never committed; never baked into the build |
| Token | Fine-grained, read-only; web: Settings → `localStorage`; desktop: `.env` (gitignored, excluded from builds) |
| Token egress | Sent only to `https://api.github.com`; the desktop app cancels requests to any other host |
| Caching | API calls use `no-store`; the service worker never caches GitHub API responses |
| Forget | Settings exposes **Forget token** and **Reset all settings** |
| Sensitive wiki paths | Do not fetch or display `immigration/`, `finance/`, `health/`, `relationships/` |
| Employer content | Out of scope — none in source or sample data |

Public UI must make sample mode obvious (badge, “Sample / placeholder” labels on sheets).

## Desktop app

- Electron main process (`electron/main.cjs`): context isolation, sandboxed renderer, no Node integration; new windows and navigation are denied (github.com links open in the browser).
- `.env` lookup: portable exe folder, then the app folder (next to the `.exe` or `.app`; project root from source), then the user data folder. Only `GITHUB_TOKEN`, `SECOND_BRAIN_REPO` and `ROSTER_URL` are read; `process.env` is ignored.
- The preload script (`electron/preload.cjs`) exposes those values as `window.agentTownDesktop`; `.env` values take priority over Settings and show there read-only.

## Milestones

### Milestone 1 — Skeleton (done)

- Vite + TypeScript canvas town, pan/zoom, tap → sheet, activity cues from sample data.
- Settings with a local token; PWA manifest, service worker, icons; GitHub Pages workflow.

### Milestone 2 — Live roster (done)

- Roster file in the owner's repo replaces the hardcoded bot list on the owner's devices; public build ships a sample roster only.
- Settings: GitHub token, second-brain repo, roster URL.
- Live PRs/commits per roster repo, section commits and index excerpt from the second-brain repo.
- Fixed building catalog (same row → same building), grey placeholders with hover errors, settings kept until reset.
- Tests (Vitest) for roster parsing, URL resolution, placement, and GitHub loading.

### Milestone 3 — Desktop (done)

- Electron app for Windows and macOS with `.env` token, network allowlist, unsigned installers from GitHub Actions.

### Milestone 4 — Polish

- Richer building art, day/night cues, accessibility pass, offline town shell hardening.

## Non-goals (near term)

- No server, no database, no auth proxy.
- No 3D engine, no app store packaging or paid code signing.
- No requests outside `api.github.com`.
- No employer-related content.

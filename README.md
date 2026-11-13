# Agent Town

A free, installable isometric town command center for a team of AI assistant bots, one building per bot.

Public visitors always see a labelled **sample** town: made-up bots from [`src/data/sample-roster.md`](src/data/sample-roster.md) with placeholder activity. Your own bots load only on your devices, from a roster file in your GitHub repo, after you save a fine-grained, read-only token.

Click the badge at the top right (**Sample data**, or **Live** once your roster loads) to see every bot in the town with its building, section, repos and activity; tap a bot to open its building.

## Quick start

```bash
git clone https://github.com/likarajo/agent-town.git
cd agent-town
npm install
npm run dev
```

Open the URL Vite prints (assets are served under `/agent-town/`).

```bash
npm test         # roster, URL and GitHub-loading tests
npm run build    # outputs dist/ for GitHub Pages
npm run preview  # preview the production build
```

### Clone into Cursor (local)

1. In Cursor: **Clone repo** → `https://github.com/likarajo/agent-town.git`
2. Open the folder, run `npm install` then `npm run dev` in the terminal.
3. Use the cloud or local agent against a feature branch — never push app work to `main` without review.

## Show your own bots

1. Add a roster file to a GitHub repo, usually your second brain. Any Markdown file works if it has a table with a `Bot` column; the rest of the page is ignored.

   ```markdown
   | Bot | Job | Building | Section | Repos |
   |-----|-----|----------|---------|-------|
   | Juno | Coordinator | plaza | inbox | your-user/notes-app |
   ```

   - **Bot** (required): the name on the building.
   - **Job:** shown under the name.
   - **Building:** `plaza`, `townhall`, `workshop`, `printshop`, `lab`, `realty`, `depot`, `bank`, `consulate` or `gym`. Anything else gets a plain building labelled with that word.
   - **Section:** the bot's folder in the second-brain repo. The building shows that folder's `index.md` and its recent commits.
   - **Repos:** comma-separated `owner/name` repos whose open pull requests and recent commits show on the building.
2. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with read-only **Contents** and **Pull requests** access to the second-brain repo and every repo in the roster.
3. Open **Settings** and fill in:
   - **GitHub token**
   - **Second-brain repo**, as `owner/name`
   - **Roster URL**: the file's GitHub link (`https://github.com/you/second-brain/blob/main/roster.md`) or its path inside the second-brain repo

The town redraws with your bots. Lit windows mean commits in the last 7 days; a flag means open pull requests.

- **Buildings stay put.** A bot's building comes only from its own row: the Building value picks a fixed look, colour and plot from [`src/town/catalog.ts`](src/town/catalog.ts), so the same row always gets the same building, on every device. Reordering, adding or removing other rows doesn't move it. If two rows pick the same building, the earlier row keeps its plot.
- **Settings are a one-time step.** They stay saved on the device, across restarts, until you choose **Reset all settings** (or **Forget token**) in Settings.
- **Grey means something didn't load.** While your roster loads, and if it can't load, the town shows grey placeholder buildings instead of your bots. A bot whose repos or notes fail to load turns grey too. Hover over a grey building (or tap it) to see the error.

## Desktop app (Windows and macOS)

The same town in an Electron app, which reads the token from a `.env` file instead of Settings.

### Run from source

```bash
cp .env.example .env   # then put your token in .env
npm run desktop
```

### `.env`

```dotenv
GITHUB_TOKEN=github_pat_...
# Optional; values here override Settings and show there as read-only.
SECOND_BRAIN_REPO=your-user/second-brain
ROSTER_URL=https://github.com/your-user/second-brain/blob/main/roster.md
```

The app uses the first `.env` it finds:

1. The app folder: next to `Agent Town.exe` on Windows, next to `Agent Town.app` on macOS, or the project root when run from source.
2. Your user data folder: `%APPDATA%\Agent Town\` on Windows, `~/Library/Application Support/Agent Town/` on macOS.

Settings shows which file it read. After editing `.env`, reload the window (Ctrl+R or Cmd+R). The app never reads your shell's environment, so a `GITHUB_TOKEN` exported for other tools isn't picked up. Anything you enter in Settings instead is saved in the user data folder and written to disk as soon as you save it.

### Build installers

```bash
npm run desktop:dist
```

This writes to `release/`: a `.dmg` and a `.zip` on macOS (universal, for Apple silicon and Intel), and an installer `.exe` and a `.zip` on Windows. Build on each OS, or run the **Build desktop app** workflow in GitHub Actions (or push a `v*` tag) to get both as downloadable artifacts.

The builds are unsigned, which keeps them free but means:

- **Windows:** SmartScreen may warn on first launch. Choose **More info → Run anyway**.
- **macOS:** a downloaded copy may be reported as damaged. Move it to Applications, then run `xattr -dr com.apple.quarantine "/Applications/Agent Town.app"` once.

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
| Public by default | Repo + Pages show only the sample roster and clearly labelled sample activity |
| No secrets in git | Never commit tokens, your roster, real repo lists, PR titles, commits, wiki text, or personal info |
| Token (web) | Optional fine-grained **read-only** PAT, pasted in Settings and stored in that device’s `localStorage` |
| Token (desktop) | Read from `.env` on your machine. `.env` is gitignored and excluded from every desktop build |
| Network | The token is sent **only** to `https://api.github.com`; the desktop app blocks every other host |
| No caching | GitHub responses are fetched with `no-store` and kept in memory only; the service worker caches the offline **shell**, never API responses |
| Forget | Settings → **Forget token**, or **Reset all settings** to also clear the roster settings |
| Blocked wiki paths | Never fetch or display `immigration/`, `finance/`, `health/`, or `relationships/` |
| Employer content | Out of scope — none in source or samples |

See [PLAN.md](./PLAN.md) for architecture, data model, and milestones.

## License

Source and original procedural art in this repository are available for personal use with the project. Do not commit secrets or private data.

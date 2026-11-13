import type { BuildingActivity } from '../github/types';
import type { ActivityCue, TownBuilding } from '../town/types';

/** What the data badge opens: the bots behind the town, or why there aren't any yet. */
export type RosterView =
  | { mode: 'loading' }
  | { mode: 'error'; reason: string }
  | { mode: 'sample'; buildings: TownBuilding[]; cues: Record<string, ActivityCue>; rosterMarkdown: string }
  | { mode: 'live'; buildings: TownBuilding[]; cues: Record<string, ActivityCue>; source: string };

function esc(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Link only to github.com; anything else renders as plain text. */
function title(text: string, url?: string): string {
  const label = `<strong>${esc(text)}</strong>`;
  return url?.startsWith('https://github.com/')
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : label;
}

export function openSheet(
  sheet: HTMLElement,
  body: HTMLElement,
  building: TownBuilding,
  activity: BuildingActivity,
): void {
  const sampleTag = activity.isSample
    ? `<span class="pill sample">Sample / placeholder</span>`
    : `<span class="pill live">Live (this device)</span>`;

  const sources = [
    building.wikiSection ? `Section ${building.wikiSection}` : '',
    building.repos.length ? building.repos.join(', ') : '',
  ].filter(Boolean);
  const sourceLine =
    !activity.isSample && sources.length ? `<p class="meta">${esc(sources.join(' · '))}</p>` : '';

  const prs =
    activity.openPrs.length === 0
      ? `<p class="muted small">No open PRs in this view.</p>`
      : `<ul class="list">${activity.openPrs
          .map(
            (pr) => `<li>
              ${title(pr.title, pr.url)}
              <span class="meta">#${pr.number} · ${esc(pr.repoLabel)} · ${esc(formatDate(pr.updatedAt))}</span>
            </li>`,
          )
          .join('')}</ul>`;

  const commits =
    activity.recentCommits.length === 0
      ? `<p class="muted small">No recent commits in this view.</p>`
      : `<ul class="list">${activity.recentCommits
          .map(
            (c) => `<li>
              ${title(c.message, c.url)}
              <span class="meta">${esc(c.sha)} · ${esc(c.repoLabel)} · ${esc(formatDate(c.date))}</span>
            </li>`,
          )
          .join('')}</ul>`;

  const wiki = activity.wikiExcerpt
    ? `<div class="wiki">
        <h4>${esc(activity.wikiExcerpt.title)}</h4>
        <pre class="wiki-md">${esc(activity.wikiExcerpt.markdown)}</pre>
      </div>`
    : `<p class="muted small">No wiki section for this bot.</p>`;

  const error = activity.error ? `<p class="sheet-error">Some data didn't load: ${esc(activity.error)}</p>` : '';

  body.innerHTML = `
    <div class="sheet-header">
      <div>
        <p class="eyebrow">${esc(building.label)}</p>
        <h2>${esc(building.name)}</h2>
        <p class="role">${esc(building.role)}</p>
        ${sourceLine}
      </div>
      ${sampleTag}
    </div>
    ${error}
    <section>
      <h3>Open PRs</h3>
      ${prs}
    </section>
    <section>
      <h3>Recent commits</h3>
      ${commits}
    </section>
    <section>
      <h3>Second-brain wiki</h3>
      ${wiki}
    </section>
    <p class="fineprint">
      ${
        activity.isSample
          ? 'Sample bots and activity. Your own roster, repos and notes load only after a read-only token is saved on this device.'
          : 'Loaded from GitHub with the token on this device. Nothing here is stored or sent anywhere else.'
      }
    </p>
  `;

  sheet.hidden = false;
  sheet.classList.add('open');
}

const settingsButton = (label: string) =>
  `<div class="row"><button type="button" class="primary" data-action="settings">${label}</button></div>`;

/** Every bot in the town at a glance; each row opens that bot's building (`data-building`). */
export function openRosterSheet(sheet: HTMLElement, body: HTMLElement, view: RosterView): void {
  if (view.mode === 'loading' || view.mode === 'error') {
    const loading = view.mode === 'loading';
    body.innerHTML = `
      <div class="sheet-header">
        <div>
          <p class="eyebrow">${loading ? 'Loading' : 'Not loaded'}</p>
          <h2>${loading ? 'Loading your roster' : 'Roster not loaded'}</h2>
        </div>
      </div>
      <p class="${loading ? 'muted' : 'sheet-error'}">${loading ? 'Your bots appear here once the roster loads.' : esc(view.reason)}</p>
      ${loading ? '' : settingsButton('Open Settings')}
    `;
  } else {
    const sample = view.mode === 'sample';
    const rows = view.buildings
      .map((b) => {
        const cue = view.cues[b.id];
        const chips = [
          cue?.error ? `<span class="chip error">Didn't load</span>` : '',
          cue?.hasOpenPrs ? `<span class="chip">Open PRs</span>` : '',
          cue?.hasRecentCommits ? `<span class="chip">${sample ? 'Recent commits' : 'Commits this week'}</span>` : '',
        ].join('');
        const where = [b.wikiSection ? `Section ${b.wikiSection}` : '', b.repos.join(', ')].filter(Boolean).join(' · ');
        return `<li>
          <button type="button" class="roster-row" data-building="${esc(b.id)}">
            <strong>${esc(b.name)}</strong>
            <span class="meta">${esc([b.role, b.label].filter(Boolean).join(' · '))}</span>
            ${where ? `<span class="meta">${esc(where)}</span>` : ''}
            ${chips ? `<span class="chips">${chips}</span>` : ''}
          </button>
        </li>`;
      })
      .join('');

    body.innerHTML = `
      <div class="sheet-header">
        <div>
          <p class="eyebrow">${sample ? 'Sample data' : 'Live data'}</p>
          <h2>${sample ? 'Sample roster' : 'Your roster'}</h2>
          <p class="role">${view.buildings.length} bots</p>
        </div>
        ${sample ? `<span class="pill sample">Sample / placeholder</span>` : `<span class="pill live">Live (this device)</span>`}
      </div>
      <p class="muted small">
        ${
          sample
            ? 'Made-up bots and activity that every visitor sees. Tap a bot to open its building.'
            : `Loaded from ${esc(view.source)} with the token on this device. Tap a bot to open its building.`
        }
      </p>
      <ul class="list roster-list">${rows}</ul>
      ${
        sample
          ? `<details class="roster-file">
              <summary>Roster file behind this town</summary>
              <pre class="wiki-md">${esc(view.rosterMarkdown)}</pre>
            </details>`
          : ''
      }
      ${settingsButton(sample ? 'Show my own bots' : 'Open Settings')}
    `;
  }
  sheet.hidden = false;
  sheet.classList.add('open');
}

/** Tapping a grey stand-in: why the roster isn't showing, and a way to fix it. */
export function openPlaceholderSheet(
  sheet: HTMLElement,
  body: HTMLElement,
  reason: string,
  loading: boolean,
): void {
  body.innerHTML = `
    <div class="sheet-header">
      <div>
        <p class="eyebrow">Placeholder</p>
        <h2>${loading ? 'Loading your roster' : 'Roster not loaded'}</h2>
      </div>
    </div>
    <p class="${loading ? 'muted' : 'sheet-error'}">${esc(reason)}</p>
    ${loading ? '' : settingsButton('Open Settings')}
    <p class="fineprint">Grey buildings stand in for your bots until your roster loads.</p>
  `;
  sheet.hidden = false;
  sheet.classList.add('open');
}

export function closeSheet(sheet: HTMLElement): void {
  sheet.classList.remove('open');
  sheet.hidden = true;
}

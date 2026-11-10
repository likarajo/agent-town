import type { BuildingActivity } from '../github/types';
import type { TownBuilding } from '../town/types';

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

export function openSheet(
  sheet: HTMLElement,
  body: HTMLElement,
  building: TownBuilding,
  activity: BuildingActivity,
): void {
  const sampleTag = activity.isSample
    ? `<span class="pill sample">Sample / placeholder</span>`
    : `<span class="pill live">Live (this device)</span>`;

  const prs =
    activity.openPrs.length === 0
      ? `<p class="muted small">No open PRs in this view.</p>`
      : `<ul class="list">${activity.openPrs
          .map(
            (pr) => `<li>
              <strong>${esc(pr.title)}</strong>
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
              <strong>${esc(c.message)}</strong>
              <span class="meta">${esc(c.sha)} · ${esc(c.repoLabel)} · ${esc(formatDate(c.date))}</span>
            </li>`,
          )
          .join('')}</ul>`;

  const wiki = activity.wikiExcerpt
    ? `<div class="wiki">
        <h4>${esc(activity.wikiExcerpt.title)}</h4>
        <pre class="wiki-md">${esc(activity.wikiExcerpt.markdown)}</pre>
      </div>`
    : `<p class="muted small">No wiki excerpt.</p>`;

  body.innerHTML = `
    <div class="sheet-header">
      <div>
        <p class="eyebrow">${esc(building.label)}</p>
        <h2>${esc(building.name)}</h2>
        <p class="role">${esc(building.role)}</p>
      </div>
      ${sampleTag}
    </div>
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
      Public visitors always see labelled sample data. Real repos, PR titles, commits, and wiki
      text load only after a read-only token is saved on this device.
    </p>
  `;

  sheet.hidden = false;
  sheet.classList.add('open');
}

export function closeSheet(sheet: HTMLElement): void {
  sheet.classList.remove('open');
  sheet.hidden = true;
}

/**
 * Roster format: the first Markdown table in the file that has a `Bot` column.
 * Optional columns: Job, Building, Section, Repos. Column order does not matter,
 * and everything outside the table (front matter, notes) is ignored.
 */

export interface RosterBot {
  name: string;
  job: string;
  /** Lowercased building type as written; unknown types become a plain building. */
  building: string;
  /** Second-brain section folder, or '' when the bot has none. */
  section: string;
  /** owner/name pairs. */
  repos: string[];
}

export class RosterError extends Error {}

const COLUMN_ALIASES: Record<keyof RosterBot, string[]> = {
  name: ['bot'],
  job: ['job', 'role', 'title'],
  building: ['building'],
  section: ['section', 'wikisection'],
  repos: ['repos', 'repo', 'repositories'],
};

const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const SECTION_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const EMPTY_CELLS = new Set(['', '-', '—', '–', 'n/a', 'none']);

/** Split a `| a | b |` row into trimmed cells, honouring `\|` escapes. */
function splitRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const cells: string[] = [];
  let current = '';
  for (let i = 1; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i++;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) cells.push(current.trim());
  return cells;
}

function isDelimiterRow(cells: string[] | null): boolean {
  return Boolean(cells && cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c)));
}

function headerKey(cell: string): string {
  return cleanCell(cell).toLowerCase().replace(/[^a-z]/g, '');
}

/** Strip Markdown decoration so `**Juno**`, `` `ops` `` and `[[ops]]` read as plain values. */
function cleanCell(cell: string): string {
  const text = cell
    .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`/g, '')
    .trim()
    .replace(/^(\*\*|__)(.+)\1$/, '$2')
    .replace(/^([*_])(.+)\1$/, '$2')
    .trim();
  return EMPTY_CELLS.has(text.toLowerCase()) ? '' : text;
}

/** Repos come from the raw cell so `[name](https://github.com/owner/name)` keeps its owner. */
function parseRepos(cell: string): string[] {
  const repos = cell
    .replace(/\[[^\]]*\]\(([^)]*)\)/g, ' $1 ')
    .replace(/[`*]/g, ' ')
    .split(/[\s,;]+/)
    .map((token) => token.replace(/^https:\/\/github\.com\//i, '').replace(/\/+$/, '').replace(/\.git$/i, ''))
    .filter((token) => REPO_RE.test(token));
  return [...new Set(repos)];
}

function parseSection(cell: string): string {
  const section = cell.replace(/^\/+|\/+$/g, '');
  if (!SECTION_RE.test(section) || section.split('/').includes('..')) return '';
  return section;
}

export function parseRoster(markdown: string): RosterBot[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');

  for (let i = 0; i < lines.length - 1; i++) {
    const header = splitRow(lines[i]);
    if (!header || !isDelimiterRow(splitRow(lines[i + 1]))) continue;

    const keys = header.map(headerKey);
    const columnOf = (field: keyof RosterBot) => keys.findIndex((k) => COLUMN_ALIASES[field].includes(k));
    const botColumn = columnOf('name');
    if (botColumn === -1) continue;

    const columns = {
      job: columnOf('job'),
      building: columnOf('building'),
      section: columnOf('section'),
      repos: columnOf('repos'),
    };
    const bots: RosterBot[] = [];
    for (let j = i + 2; j < lines.length; j++) {
      const cells = splitRow(lines[j]);
      if (!cells) break;
      const raw = (index: number) => (index === -1 ? '' : (cells[index] ?? ''));
      const cell = (index: number) => cleanCell(raw(index));
      const name = cell(botColumn);
      if (!name) continue;
      bots.push({
        name,
        job: cell(columns.job),
        building: cell(columns.building).toLowerCase(),
        section: parseSection(cell(columns.section)),
        repos: cell(columns.repos) ? parseRepos(raw(columns.repos)) : [],
      });
    }
    if (bots.length === 0) throw new RosterError('The roster table has no bots in it.');
    return bots;
  }

  throw new RosterError('No roster table found. The file needs a Markdown table with a "Bot" column.');
}

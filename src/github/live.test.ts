import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLiveTown, loadTown } from '../roster/load';
import type { TownBuilding } from '../town/types';
import { loadAllCues } from './client';
import { LiveGitHubDataSource } from './live';

type Routes = Record<string, unknown>;

function base64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)));
}

/** Fake api.github.com: answers each known path, 404s the rest, and records every call. */
function mockGitHub(routes: Routes) {
  const calls: Array<{ url: string; auth: string | null }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('Authorization');
      calls.push({ url: input, auth });
      const url = new URL(input);
      const body = routes[url.pathname + url.search];
      return body === undefined
        ? new Response('{"message":"Not Found"}', { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return calls;
}

function building(extra: Partial<TownBuilding>): TownBuilding {
  return {
    id: 'forge',
    name: 'Forge',
    role: 'Builder',
    buildingType: 'workshop',
    label: 'Workshop',
    q: 1,
    r: 4,
    accent: '#000000',
    wikiSection: '',
    repos: [],
    ...extra,
  };
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Settings as Settings would have saved them on this device. */
function savedSettings(values: Record<string, string>) {
  const store = new Map(Object.entries(values));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadLiveTown', () => {
  it('fetches the roster through the contents API and builds the town from it', async () => {
    const calls = mockGitHub({
      '/repos/me/brain/contents/ops/roster.md?ref=main': {
        type: 'file',
        encoding: 'base64',
        content: base64('| Bot | Building | Section |\n|---|---|---|\n| Atlas · ops | townhall | ops |'),
      },
    });

    const load = await loadLiveTown('tok', {
      secondBrainRepo: '',
      rosterUrl: 'https://github.com/me/brain/blob/main/ops/roster.md',
    });

    expect(load.mode).toBe('live');
    if (load.mode !== 'live') return;
    expect(load.town.buildings.map((b) => [b.name, b.buildingType, b.wikiSection])).toEqual([
      ['Atlas · ops', 'townhall', 'ops'],
    ]);
    expect(load.wikiRepo).toEqual({ owner: 'me', repo: 'brain' });
    expect(calls).toEqual([{ url: 'https://api.github.com/repos/me/brain/contents/ops/roster.md?ref=main', auth: 'Bearer tok' }]);
  });

  it('refuses roster paths under blocked sections without calling GitHub', async () => {
    const calls = mockGitHub({});
    await expect(loadLiveTown('tok', { secondBrainRepo: 'me/brain', rosterUrl: 'finance/roster.md' })).rejects.toThrow(
      'blocked',
    );
    expect(calls).toEqual([]);
  });

  it('turns GitHub errors into readable messages', async () => {
    mockGitHub({});
    await expect(loadLiveTown('tok', { secondBrainRepo: 'me/brain', rosterUrl: 'roster.md' })).rejects.toThrow(
      'could not find me/brain/roster.md (404)',
    );
  });
});

describe('loadTown', () => {
  it('shows the sample town without a token and never calls GitHub', async () => {
    savedSettings({});
    const calls = mockGitHub({});
    const load = await loadTown();
    expect(load.mode).toBe('sample');
    expect(load.town.buildings.map((b) => b.name)).toEqual(['Juno', 'Atlas', 'Forge', 'Quill', 'Beacon', 'Scout', 'Pantry']);
    expect(calls).toEqual([]);
  });

  it('shows grey placeholders carrying the reason when the saved roster cannot load', async () => {
    savedSettings({
      'agent-town.github.token': 'tok',
      'agent-town.owner.config': JSON.stringify({ secondBrainRepo: 'me/brain', rosterUrl: 'roster.md' }),
    });
    mockGitHub({});
    const load = await loadTown();
    expect(load.mode).toBe('error');
    if (load.mode !== 'error') return;
    expect(load.reason).toContain('could not find me/brain/roster.md (404)');
    expect(load.town.buildings.length).toBeGreaterThan(0);
    expect(load.town.buildings.every((b) => b.placeholderReason === load.reason && b.name === '')).toBe(true);
  });
});

describe('loadAllCues', () => {
  it("passes each bot's load error through, so only that building turns grey", async () => {
    mockGitHub({});
    const source = new LiveGitHubDataSource('tok', { owner: 'me', repo: 'brain' });
    const cues = await loadAllCues(source, [building({ repos: ['me/missing'] }), building({ id: 'quiet' })]);
    expect(cues.forge.error).toContain('could not find me/missing (404)');
    expect(cues.quiet.error).toBeUndefined();
  });
});

describe('LiveGitHubDataSource', () => {
  it('combines repo activity with the bot section of the second brain', async () => {
    const calls = mockGitHub({
      '/repos/me/tools/pulls?state=open&per_page=5': [
        { title: 'Add tiles', number: 7, updated_at: daysAgo(1), html_url: 'https://github.com/me/tools/pull/7' },
      ],
      '/repos/me/tools/commits?per_page=5': [
        { sha: 'aaaaaaa1', html_url: 'https://github.com/me/tools/commit/a', commit: { message: 'Old fix\n\nbody', author: null, committer: { date: daysAgo(20) } } },
      ],
      '/repos/me/brain/commits?per_page=5&path=projects': [
        { sha: 'bbbbbbb2', html_url: 'https://github.com/me/brain/commit/b', commit: { message: 'projects: note', author: null, committer: { date: daysAgo(2) } } },
      ],
      '/repos/me/brain/contents/projects/index.md': {
        type: 'file',
        encoding: 'base64',
        content: base64('---\ntitle: x\n---\n\n## TL;DR\n\n- Notes'),
      },
    });

    const source = new LiveGitHubDataSource('tok', { owner: 'me', repo: 'brain' });
    const activity = await source.getActivity(building({ wikiSection: 'projects', repos: ['me/tools'] }));

    expect(activity.openPrs.map((pr) => pr.title)).toEqual(['Add tiles']);
    expect(activity.recentCommits.map((c) => [c.message, c.repoLabel])).toEqual([
      ['projects: note', 'brain/projects'],
      ['Old fix', 'me/tools'],
    ]);
    expect(activity.wikiExcerpt).toEqual({ title: 'projects/index.md', markdown: '## TL;DR\n\n- Notes' });
    expect(activity.cues).toEqual({ hasOpenPrs: true, hasRecentCommits: true });
    expect(activity.error).toBeUndefined();
    expect(calls.every((c) => c.url.startsWith('https://api.github.com/') && c.auth === 'Bearer tok')).toBe(true);

    await source.getActivity(building({ wikiSection: 'projects', repos: ['me/tools'] }));
    expect(calls).toHaveLength(4);
  });

  it('falls back to wiki/index.md and reports failures without hiding what loaded', async () => {
    mockGitHub({
      '/repos/me/brain/commits?per_page=5&path=ops': [],
      '/repos/me/brain/contents/ops/wiki/index.md': { type: 'file', encoding: 'base64', content: base64('# Ops') },
    });

    const activity = await new LiveGitHubDataSource('tok', { owner: 'me', repo: 'brain' }).getActivity(
      building({ wikiSection: 'ops', repos: ['me/missing'] }),
    );

    expect(activity.wikiExcerpt?.title).toBe('ops/wiki/index.md');
    expect(activity.error).toContain('could not find me/missing (404)');
    expect(activity.cues).toEqual({ hasOpenPrs: false, hasRecentCommits: false });
  });

  it('never reads blocked sections', async () => {
    const calls = mockGitHub({});
    const activity = await new LiveGitHubDataSource('tok', { owner: 'me', repo: 'brain' }).getActivity(
      building({ wikiSection: 'health' }),
    );
    expect(calls).toEqual([]);
    expect(activity.wikiExcerpt?.title).toBe('Blocked section');
  });
});

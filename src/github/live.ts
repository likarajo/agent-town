import { parseRepoFullName, type RepoRef } from '../roster/location';
import type { TownBuilding } from '../town/types';
import { getFileText, ghGet, GitHubError, repoPath } from './api';
import {
  isBlockedWikiPath,
  type BuildingActivity,
  type CommitSummary,
  type OpenPrSummary,
  type TownDataSource,
  type WikiExcerpt,
} from './types';

/** Commits newer than this light a building's windows. */
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REPOS_PER_BOT = 3;

interface GhPull {
  title: string;
  number: number;
  updated_at: string;
  html_url: string;
}

interface GhCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { date: string } | null;
    committer: { date: string } | null;
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stripFrontMatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

/**
 * Live GitHub data for one roster. Sends the token only to api.github.com, never reads blocked
 * wiki paths, and keeps results in memory for this page load only.
 */
export class LiveGitHubDataSource implements TownDataSource {
  readonly mode = 'live' as const;
  private readonly cache = new Map<string, Promise<BuildingActivity>>();

  constructor(
    private readonly token: string,
    private readonly wikiRepo: RepoRef | null,
  ) {}

  getActivity(building: TownBuilding): Promise<BuildingActivity> {
    let pending = this.cache.get(building.id);
    if (!pending) {
      pending = this.fetchActivity(building);
      this.cache.set(building.id, pending);
    }
    return pending;
  }

  private async pulls(repo: RepoRef, label: string): Promise<OpenPrSummary[]> {
    const pulls = await ghGet<GhPull[]>(
      `${repoPath(repo.owner, repo.repo)}/pulls?state=open&per_page=5`,
      this.token,
      label,
    );
    return pulls.map((pr) => ({
      title: pr.title,
      number: pr.number,
      updatedAt: pr.updated_at,
      repoLabel: label,
      url: pr.html_url,
    }));
  }

  private async commits(repo: RepoRef, label: string, path?: string): Promise<CommitSummary[]> {
    const pathQuery = path ? `&path=${encodeURIComponent(path)}` : '';
    const commits = await ghGet<GhCommit[]>(
      `${repoPath(repo.owner, repo.repo)}/commits?per_page=5${pathQuery}`,
      this.token,
      label,
    );
    return commits.map((c) => ({
      message: c.commit.message.split('\n')[0] ?? c.commit.message,
      sha: c.sha.slice(0, 7),
      date: c.commit.committer?.date ?? c.commit.author?.date ?? '',
      repoLabel: label,
      url: c.html_url,
    }));
  }

  /** The section's index page; older second brains keep it under `wiki/`. */
  private async wiki(repo: RepoRef, section: string): Promise<WikiExcerpt> {
    for (const path of [`${section}/index.md`, `${section}/wiki/index.md`]) {
      try {
        return { title: path, markdown: stripFrontMatter(await getFileText({ ...repo, path }, this.token)) };
      } catch (err) {
        if (!(err instanceof GitHubError && err.status === 404)) throw err;
      }
    }
    return { title: `${section}/index.md`, markdown: '_This section has no index.md._' };
  }

  private async fetchActivity(building: TownBuilding): Promise<BuildingActivity> {
    const errors = new Set<string>();
    const openPrs: OpenPrSummary[] = [];
    const commits: CommitSummary[] = [];
    let wikiExcerpt: WikiExcerpt | null = null;

    const jobs: Promise<void>[] = [];
    const run = <T>(work: Promise<T>, use: (value: T) => void) =>
      jobs.push(work.then(use, (err: unknown) => void errors.add(errorMessage(err))));

    for (const fullName of building.repos.slice(0, MAX_REPOS_PER_BOT)) {
      const repo = parseRepoFullName(fullName);
      if (!repo) continue;
      run(this.pulls(repo, fullName), (prs) => openPrs.push(...prs));
      run(this.commits(repo, fullName), (list) => commits.push(...list));
    }

    const section = building.wikiSection;
    if (section && isBlockedWikiPath(section)) {
      wikiExcerpt = { title: 'Blocked section', markdown: 'This section is blocked by the privacy rules and is never read.' };
    } else if (section && this.wikiRepo) {
      run(this.commits(this.wikiRepo, `${this.wikiRepo.repo}/${section}`, section), (list) => commits.push(...list));
      run(this.wiki(this.wikiRepo, section), (excerpt) => {
        wikiExcerpt = excerpt;
      });
    }

    await Promise.all(jobs);

    const seen = new Set<string>();
    const recentCommits = commits
      .filter((c) => {
        if (seen.has(c.sha)) return false;
        seen.add(c.sha);
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
    openPrs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const now = Date.now();

    return {
      buildingId: building.id,
      openPrs,
      recentCommits,
      wikiExcerpt,
      isSample: false,
      error: errors.size > 0 ? [...errors].join(' ') : undefined,
      cues: {
        hasOpenPrs: openPrs.length > 0,
        hasRecentCommits: recentCommits.some((c) => now - Date.parse(c.date) < RECENT_MS),
      },
    };
  }
}

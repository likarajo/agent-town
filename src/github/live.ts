import { getOwnerConfig } from '../privacy/configStore';
import { getToken } from '../privacy/tokenStore';
import {
  isBlockedWikiPath,
  type BuildingActivity,
  type CommitSummary,
  type OpenPrSummary,
  type TownDataSource,
  type WikiExcerpt,
} from './types';

/**
 * Live GitHub data source (Milestone 1 skeleton).
 * - Sends the token only to api.github.com
 * - Uses owner config from localStorage (never from the committed build)
 * - Refuses blocked wiki path prefixes
 *
 * Full PR/commit/wiki hydration lands in Milestone 2; Milestone 1 wires the
 * interface and a safe fetch helper so the settings flow is real.
 */
const API = 'https://api.github.com';

async function ghGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

function wikiContentPath(section: string): string {
  const cleaned = section.replace(/^\/+|\/+$/g, '');
  return `${cleaned}/wiki/index.md`;
}

export class LiveGitHubDataSource implements TownDataSource {
  readonly mode = 'live' as const;

  async getActivity(buildingId: string): Promise<BuildingActivity> {
    const token = getToken();
    if (!token) {
      throw new Error('No token available for live data');
    }

    const config = getOwnerConfig();
    const repos = config.reposByBuilding[buildingId] ?? [];
    const section = config.wikiSectionByBuilding[buildingId] ?? '';

    const openPrs: OpenPrSummary[] = [];
    const recentCommits: CommitSummary[] = [];

    // Milestone 1: attempt lightweight live reads when repos look configured;
    // degrade gracefully so the sheet still works.
    for (const fullName of repos.slice(0, 3)) {
      if (!fullName.includes('/') || fullName.startsWith('your-user/')) continue;
      const [owner, repo] = fullName.split('/');
      try {
        const prs = await ghGet<
          Array<{ title: string; number: number; updated_at: string; html_url: string }>
        >(`/repos/${owner}/${repo}/pulls?state=open&per_page=5`, token);
        for (const pr of prs) {
          openPrs.push({
            title: pr.title,
            number: pr.number,
            updatedAt: pr.updated_at,
            repoLabel: fullName,
            url: pr.html_url,
          });
        }
      } catch {
        // Ignore per-repo failures in the skeleton.
      }

      try {
        const commits = await ghGet<
          Array<{ sha: string; commit: { message: string; author: { date: string } }; html_url: string }>
        >(`/repos/${owner}/${repo}/commits?per_page=5`, token);
        for (const c of commits) {
          recentCommits.push({
            message: c.commit.message.split('\n')[0] ?? c.commit.message,
            sha: c.sha.slice(0, 7),
            date: c.commit.author.date,
            repoLabel: fullName,
            url: c.html_url,
          });
        }
      } catch {
        // Ignore per-repo failures in the skeleton.
      }
    }

    let wikiExcerpt: WikiExcerpt | null = null;
    if (section && config.wikiRepo.includes('/') && !config.wikiRepo.startsWith('your-user/')) {
      const path = wikiContentPath(section);
      if (isBlockedWikiPath(path) || isBlockedWikiPath(section)) {
        wikiExcerpt = {
          title: 'Blocked path',
          markdown:
            'This section path is blocked by the privacy model (immigration/, finance/, or health/).',
        };
      } else {
        try {
          const [owner, repo] = config.wikiRepo.split('/');
          const file = await ghGet<{ content: string; encoding: string; html_url: string; name: string }>(
            `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
            token,
          );
          if (file.encoding === 'base64' && file.content) {
            const bytes = Uint8Array.from(atob(file.content.replace(/\n/g, '')), (ch) => ch.charCodeAt(0));
            const markdown = new TextDecoder().decode(bytes);
            wikiExcerpt = { title: path, markdown };
          }
        } catch {
          wikiExcerpt = {
            title: path,
            markdown: '_Wiki page not found or not readable with this token._',
          };
        }
      }
    } else {
      wikiExcerpt = {
        title: 'Configure wiki in Settings',
        markdown:
          'Live wiki excerpts appear after you set a real wiki repo and section keys in Settings (stored only on this device).',
      };
    }

    if (repos.every((r) => r.startsWith('your-user/')) && openPrs.length === 0) {
      // Owner still on placeholders — surface an empty live shell rather than sample text.
      return {
        buildingId,
        openPrs: [],
        recentCommits: [],
        wikiExcerpt,
        isSample: false,
        cues: { hasOpenPrs: false, hasRecentCommits: false },
      };
    }

    return {
      buildingId,
      openPrs,
      recentCommits,
      wikiExcerpt,
      isSample: false,
      cues: {
        hasOpenPrs: openPrs.length > 0,
        hasRecentCommits: recentCommits.length > 0,
      },
    };
  }
}

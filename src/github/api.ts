import type { FileLocation } from '../roster/location';

/** The only host that ever receives the token. */
const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    what: string,
  ) {
    super(GitHubError.describe(status, what));
  }

  private static describe(status: number, what: string): string {
    if (status === 401) return 'GitHub rejected the token (401). Check that it is valid and not expired.';
    if (status === 403 || status === 429) {
      return 'GitHub refused the request (403). The token may not have access, or the rate limit was hit.';
    }
    if (status === 404) return `GitHub could not find ${what} (404). Check the name and that the token can read it.`;
    return `GitHub returned ${status} for ${what}.`;
  }
}

export function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export async function ghGet<T>(path: string, token: string, what = path): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    // Keep repo contents out of the browser's disk cache.
    cache: 'no-store',
  });
  if (!res.ok) throw new GitHubError(res.status, what);
  return (await res.json()) as T;
}

export async function getFileText(file: FileLocation, token: string): Promise<string> {
  const query = file.ref ? `?ref=${encodeURIComponent(file.ref)}` : '';
  const what = `${file.owner}/${file.repo}/${file.path}`;
  const body = await ghGet<{ type?: string; encoding?: string; content?: string }>(
    `${repoPath(file.owner, file.repo)}/contents/${encodePath(file.path)}${query}`,
    token,
    what,
  );
  if (body.type !== 'file' || body.encoding !== 'base64' || typeof body.content !== 'string') {
    throw new Error(`${what} is not a file GitHub can return.`);
  }
  const bytes = Uint8Array.from(atob(body.content.replace(/\s/g, '')), (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

import { RosterError } from './parse';

export interface RepoRef {
  owner: string;
  repo: string;
}

export interface FileLocation extends RepoRef {
  path: string;
  /** Branch, tag or commit; omitted means the repo's default branch. */
  ref?: string;
}

const OWNER_RE = /^[A-Za-z0-9-]+$/;
const REPO_RE = /^[A-Za-z0-9._-]+$/;

/** Accepts `owner/name` or `https://github.com/owner/name`. */
export function parseRepoFullName(value: string): RepoRef | null {
  const cleaned = value
    .trim()
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const [owner, repo, ...rest] = cleaned.split('/');
  if (rest.length > 0 || !owner || !repo || !OWNER_RE.test(owner) || !REPO_RE.test(repo)) return null;
  return { owner, repo };
}

function checkedLocation(owner: string, repo: string, path: string, ref?: string): FileLocation {
  const cleanPath = path.replace(/^\/+/, '');
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || !cleanPath || cleanPath.split('/').includes('..')) {
    throw new RosterError('The roster URL does not point at a file in a GitHub repo.');
  }
  return ref ? { owner, repo, path: cleanPath, ref } : { owner, repo, path: cleanPath };
}

/**
 * Turn the roster URL from Settings into a repo file. Every form is later fetched through
 * api.github.com, so the token never goes to another host:
 * - https://github.com/owner/repo/blob/ref/path.md
 * - https://raw.githubusercontent.com/owner/repo/ref/path.md
 * - https://api.github.com/repos/owner/repo/contents/path.md?ref=ref
 * - path.md, relative to the second-brain repo
 */
export function resolveRosterLocation(rosterUrl: string, secondBrainRepo: string): FileLocation {
  const input = rosterUrl.trim();
  if (!input) throw new RosterError('Set a roster URL in Settings.');

  if (!/^https?:\/\//i.test(input)) {
    const repo = parseRepoFullName(secondBrainRepo);
    if (!repo) {
      throw new RosterError('Set the second-brain repo (owner/name) in Settings, or use a full GitHub link for the roster.');
    }
    return checkedLocation(repo.owner, repo.repo, input);
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new RosterError('The roster URL is not a valid link.');
  }
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (url.hostname === 'github.com' && parts.length >= 5 && (parts[2] === 'blob' || parts[2] === 'raw')) {
    return checkedLocation(parts[0], parts[1], parts.slice(4).join('/'), parts[3]);
  }
  if (url.hostname === 'raw.githubusercontent.com' && parts.length >= 4) {
    if (parts[2] === 'refs' && parts[3] === 'heads' && parts.length >= 6) {
      return checkedLocation(parts[0], parts[1], parts.slice(5).join('/'), parts[4]);
    }
    return checkedLocation(parts[0], parts[1], parts.slice(3).join('/'), parts[2]);
  }
  if (url.hostname === 'api.github.com' && parts[0] === 'repos' && parts[3] === 'contents' && parts.length >= 5) {
    return checkedLocation(parts[1], parts[2], parts.slice(4).join('/'), url.searchParams.get('ref') ?? undefined);
  }
  throw new RosterError(
    'The roster URL must be a GitHub file link, like https://github.com/you/second-brain/blob/main/roster.md.',
  );
}

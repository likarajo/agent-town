import sampleRosterMarkdown from '../data/sample-roster.md?raw';
import { getFileText } from '../github/api';
import { isBlockedWikiPath } from '../github/types';
import { getOwnerConfig, type OwnerConfig } from '../privacy/configStore';
import { getToken } from '../privacy/tokenStore';
import type { TownData } from '../town/types';
import { parseRepoFullName, resolveRosterLocation, type RepoRef } from './location';
import { parseRoster, RosterError } from './parse';
import { buildTown, placeholderTown } from './town';

export const LOADING_REASON = 'Loading your roster…';

/** The public sample roster, shown as-is in the data panel to explain the format. */
export const SAMPLE_ROSTER_MARKDOWN = sampleRosterMarkdown;

export type TownLoad =
  /** No token: the public sample town. */
  | { mode: 'sample'; town: TownData }
  /** Token saved but the roster didn't load: grey placeholders that show `reason` on hover. */
  | { mode: 'error'; town: TownData; reason: string }
  | {
      mode: 'live';
      town: TownData;
      token: string;
      /** Repo whose sections hold each bot's notes and commits. */
      wikiRepo: RepoRef | null;
      /** owner/repo/path of the roster file, for status messages. */
      source: string;
    };

export function sampleTown(): TownData {
  return buildTown(parseRoster(sampleRosterMarkdown));
}

/** Shown while the owner's roster loads, so sample bots never stand in for real ones. */
export function loadingTown(): TownData {
  return placeholderTown(LOADING_REASON);
}

export async function loadLiveTown(token: string, config: OwnerConfig): Promise<TownLoad> {
  const file = resolveRosterLocation(config.rosterUrl, config.secondBrainRepo);
  if (isBlockedWikiPath(file.path)) throw new RosterError('That roster path is blocked by the privacy rules.');
  const bots = parseRoster(await getFileText(file, token));
  return {
    mode: 'live',
    town: buildTown(bots),
    token,
    wikiRepo: parseRepoFullName(config.secondBrainRepo) ?? { owner: file.owner, repo: file.repo },
    source: `${file.owner}/${file.repo}/${file.path}`,
  };
}

/** Public visitors get the sample town; a saved token loads the owner's roster instead. */
export async function loadTown(): Promise<TownLoad> {
  const token = getToken();
  if (!token) return { mode: 'sample', town: sampleTown() };
  try {
    return await loadLiveTown(token, getOwnerConfig());
  } catch (err) {
    const reason = `Couldn't load your roster. ${err instanceof Error ? err.message : String(err)}`;
    return { mode: 'error', town: placeholderTown(reason), reason };
  }
}

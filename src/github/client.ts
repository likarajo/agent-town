import type { TownLoad } from '../roster/load';
import type { ActivityCue, TownBuilding } from '../town/types';
import { LiveGitHubDataSource } from './live';
import { SampleDataSource } from './sample';
import type { BuildingActivity, TownDataSource } from './types';

/** Parallel building loads; keeps a big roster under GitHub's secondary rate limits. */
const CONCURRENCY = 4;

export function createDataSource(load: TownLoad): TownDataSource {
  return load.mode === 'live' ? new LiveGitHubDataSource(load.token, load.wikiRepo) : new SampleDataSource();
}

export async function loadActivity(source: TownDataSource, building: TownBuilding): Promise<BuildingActivity> {
  try {
    return await source.getActivity(building);
  } catch (err) {
    return {
      buildingId: building.id,
      openPrs: [],
      recentCommits: [],
      wikiExcerpt: null,
      isSample: source.mode === 'sample',
      error: err instanceof Error ? err.message : String(err),
      cues: { hasOpenPrs: false, hasRecentCommits: false },
    };
  }
}

export async function loadAllCues(
  source: TownDataSource,
  buildings: TownBuilding[],
): Promise<Record<string, ActivityCue>> {
  const out: Record<string, ActivityCue> = {};
  const queue = [...buildings];
  const worker = async () => {
    for (let building = queue.shift(); building; building = queue.shift()) {
      const activity = await loadActivity(source, building);
      out[building.id] = { ...activity.cues, isSample: activity.isSample, error: activity.error };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, buildings.length) }, worker));
  return out;
}

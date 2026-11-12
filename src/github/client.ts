import { hasToken } from '../privacy/tokenStore';
import { LiveGitHubDataSource } from './live';
import { SampleDataSource } from './sample';
import type { BuildingActivity, DataMode, TownDataSource } from './types';

const sample = new SampleDataSource();

export function getDataMode(): DataMode {
  return hasToken() ? 'live' : 'sample';
}

export function createDataSource(): TownDataSource {
  return hasToken() ? new LiveGitHubDataSource() : sample;
}

export async function loadActivity(buildingId: string): Promise<BuildingActivity> {
  const source = createDataSource();
  try {
    return await source.getActivity(buildingId);
  } catch {
    // Always fall back to clearly labelled sample data if live fails.
    return sample.getActivity(buildingId);
  }
}

export async function loadAllCues(
  buildingIds: string[],
): Promise<Record<string, BuildingActivity['cues'] & { isSample: boolean }>> {
  const out: Record<string, BuildingActivity['cues'] & { isSample: boolean }> = {};
  await Promise.all(
    buildingIds.map(async (id) => {
      const activity = await loadActivity(id);
      out[id] = { ...activity.cues, isSample: activity.isSample };
    }),
  );
  return out;
}

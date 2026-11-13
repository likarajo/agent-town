import type { TownBuilding } from '../town/types';
import type { BuildingActivity, TownDataSource } from './types';

/** Clearly labelled placeholder activity for the bots in `src/data/sample-roster.md`. */
const SAMPLE: Record<string, Omit<BuildingActivity, 'buildingId' | 'isSample' | 'cues'>> = {
  juno: {
    openPrs: [
      {
        title: '[Sample] Weekly plan template',
        number: 3,
        updatedAt: '2026-03-03T12:00:00Z',
        repoLabel: 'sample-repo-plaza',
      },
    ],
    recentCommits: [
      {
        message: '[Sample] Route new requests to the right bot',
        sha: 'jun0001',
        date: '2026-03-03T12:20:00Z',
        repoLabel: 'sample-repo-plaza',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · inbox/index.md',
      markdown: '# Inbox (sample)\n\nPlaceholder notes for the public demo. Real notes load only with a local token.',
    },
  },
  atlas: {
    openPrs: [
      {
        title: '[Sample] Monthly usage check',
        number: 9,
        updatedAt: '2026-03-02T17:00:00Z',
        repoLabel: 'sample-repo-townhall',
      },
    ],
    recentCommits: [
      {
        message: '[Sample] Tidy the operations checklist',
        sha: 'atl1234',
        date: '2026-03-02T17:30:00Z',
        repoLabel: 'sample-repo-townhall',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · ops/index.md',
      markdown: '# Town hall (sample)\n\nOperations placeholders for the public demo.',
    },
  },
  forge: {
    openPrs: [
      {
        title: '[Sample] Add isometric tile helper tests',
        number: 12,
        updatedAt: '2026-03-01T14:00:00Z',
        repoLabel: 'sample-repo-workshop',
      },
    ],
    recentCommits: [
      {
        message: '[Sample] Polish workshop building glyph',
        sha: 'abc1234',
        date: '2026-03-02T09:10:00Z',
        repoLabel: 'sample-repo-workshop',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · projects/index.md',
      markdown: '# Workshop notes (sample)\n\nPlaceholder project notes.',
    },
  },
  quill: {
    openPrs: [
      {
        title: '[Sample] Draft a launch post',
        number: 4,
        updatedAt: '2026-02-28T18:20:00Z',
        repoLabel: 'sample-repo-printshop',
      },
    ],
    recentCommits: [
      {
        message: '[Sample] Update print-shop accent',
        sha: 'def5678',
        date: '2026-03-01T11:00:00Z',
        repoLabel: 'sample-repo-printshop',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · writing/index.md',
      markdown: '# Writing desk (sample)\n\nNo real drafts or titles here.',
    },
  },
  beacon: {
    openPrs: [],
    recentCommits: [
      {
        message: '[Sample] Outline a reading digest',
        sha: 'bea0001',
        date: '2026-03-03T08:00:00Z',
        repoLabel: 'sample-repo-lab',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · reading/index.md',
      markdown: '# Lab notes (sample)\n\nPlaceholder reading list.',
    },
  },
  scout: {
    openPrs: [],
    recentCommits: [],
    wikiExcerpt: {
      title: 'Sample · deals/index.md',
      markdown: '# Deal board (sample)\n\nMade-up listings only.',
    },
  },
  pantry: {
    openPrs: [],
    recentCommits: [
      {
        message: '[Sample] Weekly shopping list',
        sha: 'pan99aa',
        date: '2026-02-27T16:40:00Z',
        repoLabel: 'sample-repo-depot',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · kitchen/index.md',
      markdown: '# Pantry (sample)\n\nGeneric meal-planning placeholders.',
    },
  },
};

export class SampleDataSource implements TownDataSource {
  readonly mode = 'sample' as const;

  async getActivity(building: TownBuilding): Promise<BuildingActivity> {
    const body = SAMPLE[building.id] ?? {
      openPrs: [],
      recentCommits: [],
      wikiExcerpt: {
        title: 'Sample · placeholder',
        markdown: '# Sample\n\nNo activity for this building yet.',
      },
    };
    return {
      buildingId: building.id,
      ...body,
      isSample: true,
      cues: {
        hasOpenPrs: body.openPrs.length > 0,
        hasRecentCommits: body.recentCommits.length > 0,
      },
    };
  }
}

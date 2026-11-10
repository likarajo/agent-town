import type { BuildingActivity, TownDataSource } from './types';

/** Clearly labelled placeholder activity — safe for the public site. */
const SAMPLE: Record<string, Omit<BuildingActivity, 'buildingId' | 'isSample' | 'cues'>> = {
  theo: {
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
      title: 'Sample · engineering/wiki/index.md',
      markdown:
        '# Workshop notes (sample)\n\nPlaceholder second-brain excerpt. Real wiki content loads only with a local token.',
    },
  },
  paige: {
    openPrs: [
      {
        title: '[Sample] Draft brand color tokens',
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
      title: 'Sample · publishing/wiki/index.md',
      markdown: '# Publishing desk (sample)\n\nNo real brand assets or titles here.',
    },
  },
  ada: {
    openPrs: [],
    recentCommits: [
      {
        message: '[Sample] Outline research digest template',
        sha: 'ada0001',
        date: '2026-03-03T08:00:00Z',
        repoLabel: 'sample-repo-lab',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · research/wiki/index.md',
      markdown: '# Lab notes (sample)\n\nPlaceholder research section.',
    },
  },
  hunter: {
    openPrs: [
      {
        title: '[Sample] Compare neighborhood walk scores',
        number: 2,
        updatedAt: '2026-02-20T12:00:00Z',
        repoLabel: 'sample-repo-realty',
      },
    ],
    recentCommits: [],
    wikiExcerpt: {
      title: 'Sample · realty/wiki/index.md',
      markdown: '# Realty office (sample)\n\nFictional listings only.',
    },
  },
  haven: {
    openPrs: [],
    recentCommits: [
      {
        message: '[Sample] Restock checklist draft',
        sha: 'hav99aa',
        date: '2026-02-27T16:40:00Z',
        repoLabel: 'sample-repo-depot',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · preparedness/wiki/index.md',
      markdown: '# Supply depot (sample)\n\nGeneric preparedness placeholders.',
    },
  },
  otto: {
    openPrs: [
      {
        title: '[Sample] Weekly ops rhythm doc',
        number: 9,
        updatedAt: '2026-03-02T17:00:00Z',
        repoLabel: 'sample-repo-townhall',
      },
    ],
    recentCommits: [
      {
        message: '[Sample] Tidy town-hall agenda stub',
        sha: 'ott1234',
        date: '2026-03-02T17:30:00Z',
        repoLabel: 'sample-repo-townhall',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · operations/wiki/index.md',
      markdown: '# Town hall (sample)\n\nOperations placeholders for the public demo.',
    },
  },
  warren: {
    openPrs: [],
    recentCommits: [
      {
        message: '[Sample] Budget spreadsheet schema sketch',
        sha: 'war5555',
        date: '2026-02-25T10:15:00Z',
        repoLabel: 'sample-repo-bank',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · planning-notes/wiki/index.md',
      markdown:
        '# Bank (sample)\n\nNo real financial data. Live fetches never use finance/ paths.',
    },
  },
  ellis: {
    openPrs: [
      {
        title: '[Sample] Checklist outline for paperwork',
        number: 1,
        updatedAt: '2026-02-18T09:00:00Z',
        repoLabel: 'sample-repo-consulate',
      },
    ],
    recentCommits: [],
    wikiExcerpt: {
      title: 'Sample · counsel-notes/wiki/index.md',
      markdown:
        '# Consulate (sample)\n\nNo real case content. Live fetches never use immigration/ paths.',
    },
  },
  max: {
    openPrs: [],
    recentCommits: [
      {
        message: '[Sample] Mobility routine card layout',
        sha: 'max7777',
        date: '2026-03-01T07:45:00Z',
        repoLabel: 'sample-repo-gym',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · coaching-notes/wiki/index.md',
      markdown: '# Gym (sample)\n\nNo personal health data. Live fetches never use health/ paths.',
    },
  },
  grok: {
    openPrs: [
      {
        title: '[Sample] Plaza welcome copy',
        number: 3,
        updatedAt: '2026-03-03T12:00:00Z',
        repoLabel: 'sample-repo-plaza',
      },
    ],
    recentCommits: [
      {
        message: '[Sample] Central plaza lighting cue',
        sha: 'gr0k001',
        date: '2026-03-03T12:20:00Z',
        repoLabel: 'sample-repo-plaza',
      },
    ],
    wikiExcerpt: {
      title: 'Sample · assistant/wiki/index.md',
      markdown: '# Central plaza (sample)\n\nAssistant desk placeholder for public visitors.',
    },
  },
};

function withCues(
  buildingId: string,
  body: Omit<BuildingActivity, 'buildingId' | 'isSample' | 'cues'>,
): BuildingActivity {
  return {
    buildingId,
    ...body,
    isSample: true,
    cues: {
      hasOpenPrs: body.openPrs.length > 0,
      hasRecentCommits: body.recentCommits.length > 0,
    },
  };
}

export class SampleDataSource implements TownDataSource {
  readonly mode = 'sample' as const;

  async getActivity(buildingId: string): Promise<BuildingActivity> {
    const body = SAMPLE[buildingId] ?? {
      openPrs: [],
      recentCommits: [],
      wikiExcerpt: {
        title: 'Sample · placeholder',
        markdown: '# Sample\n\nNo activity for this building yet.',
      },
    };
    return withCues(buildingId, body);
  }
}

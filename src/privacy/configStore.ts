/**
 * Owner-editable repo/wiki config — localStorage only.
 * Source ships generic placeholders; never bake real repo lists into the build.
 */

export interface OwnerConfig {
  wikiRepo: string;
  reposByBuilding: Record<string, string[]>;
  wikiSectionByBuilding: Record<string, string>;
}

const CONFIG_KEY = 'agent-town.owner.config';

/** Generic placeholders only — not real repositories. */
export const PLACEHOLDER_CONFIG: OwnerConfig = {
  wikiRepo: 'your-user/second-brain',
  reposByBuilding: {
    theo: ['your-user/sample-workshop'],
    paige: ['your-user/sample-printshop'],
    ada: ['your-user/sample-lab'],
    hunter: ['your-user/sample-realty'],
    haven: ['your-user/sample-depot'],
    otto: ['your-user/sample-townhall'],
    warren: ['your-user/sample-bank'],
    ellis: ['your-user/sample-consulate'],
    max: ['your-user/sample-gym'],
    grok: ['your-user/sample-plaza'],
  },
  wikiSectionByBuilding: {
    theo: 'engineering',
    paige: 'publishing',
    ada: 'research',
    hunter: 'realty',
    haven: 'preparedness',
    otto: 'operations',
    warren: 'planning-notes',
    ellis: 'counsel-notes',
    max: 'coaching-notes',
    grok: 'assistant',
  },
};

export function getOwnerConfig(): OwnerConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return structuredClone(PLACEHOLDER_CONFIG);
    const parsed = JSON.parse(raw) as Partial<OwnerConfig>;
    return {
      wikiRepo: typeof parsed.wikiRepo === 'string' ? parsed.wikiRepo : PLACEHOLDER_CONFIG.wikiRepo,
      reposByBuilding: {
        ...PLACEHOLDER_CONFIG.reposByBuilding,
        ...(parsed.reposByBuilding ?? {}),
      },
      wikiSectionByBuilding: {
        ...PLACEHOLDER_CONFIG.wikiSectionByBuilding,
        ...(parsed.wikiSectionByBuilding ?? {}),
      },
    };
  } catch {
    return structuredClone(PLACEHOLDER_CONFIG);
  }
}

export function setOwnerConfig(config: OwnerConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function resetOwnerConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
}

import { describe, expect, it } from 'vitest';
import sampleRoster from '../data/sample-roster.md?raw';
import { parseRoster, RosterError } from './parse';

describe('parseRoster', () => {
  it('reads the first table with a Bot column and ignores the rest of the page', () => {
    const markdown = [
      '---',
      'title: "Roster"',
      '---',
      '',
      '| Name | Note |',
      '|------|------|',
      '| not | this one |',
      '',
      '## Roster',
      '',
      '| Bot | Job | Building | Section | Repos |',
      '|-----|-----|----------|---------|-------|',
      '| Juno | Coordinator | plaza | inbox | |',
      '| Forge | Builder | Workshop | projects/ | me/tools, me/site |',
      '',
      'Notes after the table.',
    ].join('\n');

    expect(parseRoster(markdown)).toEqual([
      { name: 'Juno', job: 'Coordinator', building: 'plaza', section: 'inbox', repos: [] },
      { name: 'Forge', job: 'Builder', building: 'workshop', section: 'projects', repos: ['me/tools', 'me/site'] },
    ]);
  });

  it('matches columns by name in any order, with only Bot required', () => {
    const markdown = '| Repos | Bot |\n| --- | :---: |\n| me/a | Atlas |\n| | Quill |';
    expect(parseRoster(markdown)).toEqual([
      { name: 'Atlas', job: '', building: '', section: '', repos: ['me/a'] },
      { name: 'Quill', job: '', building: '', section: '', repos: [] },
    ]);
  });

  it('strips Markdown decoration without breaking underscores in names', () => {
    const markdown = [
      '| Bot | Job | Section | Repos |',
      '|---|---|---|---|',
      '| **Beacon** | _Research Lead_ | `reading_list` | [lab](https://github.com/me/lab_notes), `me/premier_league` |',
      '| [[Scout]] | — | - | n/a |',
    ].join('\r\n');
    expect(parseRoster(markdown)).toEqual([
      {
        name: 'Beacon',
        job: 'Research Lead',
        building: '',
        section: 'reading_list',
        repos: ['me/lab_notes', 'me/premier_league'],
      },
      { name: 'Scout', job: '', building: '', section: '', repos: [] },
    ]);
  });

  it('drops section values that are not plain relative paths', () => {
    const markdown = '| Bot | Section |\n|---|---|\n| A | ../secrets |\n| B | /notes/ |\n| C | a b |';
    expect(parseRoster(markdown).map((bot) => bot.section)).toEqual(['', 'notes', '']);
  });

  it('skips rows without a bot name', () => {
    const markdown = '| Bot | Job |\n|---|---|\n|  | Ghost |\n| Pantry | Meals |';
    expect(parseRoster(markdown).map((bot) => bot.name)).toEqual(['Pantry']);
  });

  it('explains what is missing', () => {
    expect(() => parseRoster('# Just notes\n\nNo table here.')).toThrow(RosterError);
    expect(() => parseRoster('| Bot | Job |\n|---|---|\n')).toThrow('no bots');
  });

  it('parses the bundled sample roster', () => {
    const bots = parseRoster(sampleRoster);
    expect(bots.map((bot) => bot.name)).toEqual(['Juno', 'Atlas', 'Forge', 'Quill', 'Beacon', 'Scout', 'Pantry']);
  });
});

import { describe, expect, it } from 'vitest';
import { parseRepoFullName, resolveRosterLocation } from './location';
import { RosterError } from './parse';

describe('parseRepoFullName', () => {
  it('accepts owner/name and github.com links', () => {
    expect(parseRepoFullName('me/second-brain')).toEqual({ owner: 'me', repo: 'second-brain' });
    expect(parseRepoFullName(' https://github.com/me/second-brain.git/ ')).toEqual({ owner: 'me', repo: 'second-brain' });
  });

  it('rejects anything else', () => {
    for (const value of ['', 'me', 'me/repo/extra', 'me/re po', 'https://gitlab.com/me/repo']) {
      expect(parseRepoFullName(value)).toBeNull();
    }
  });
});

describe('resolveRosterLocation', () => {
  it('reads github.com blob links, including the branch', () => {
    expect(resolveRosterLocation('https://github.com/me/brain/blob/main/ops/wiki/roster.md', '')).toEqual({
      owner: 'me',
      repo: 'brain',
      ref: 'main',
      path: 'ops/wiki/roster.md',
    });
  });

  it('reads raw.githubusercontent.com links in both forms', () => {
    expect(resolveRosterLocation('https://raw.githubusercontent.com/me/brain/dev/roster.md', '')).toEqual({
      owner: 'me',
      repo: 'brain',
      ref: 'dev',
      path: 'roster.md',
    });
    expect(
      resolveRosterLocation('https://raw.githubusercontent.com/me/brain/refs/heads/main/a/roster.md', ''),
    ).toEqual({ owner: 'me', repo: 'brain', ref: 'main', path: 'a/roster.md' });
  });

  it('reads api.github.com contents links', () => {
    expect(
      resolveRosterLocation('https://api.github.com/repos/me/brain/contents/roster%20page.md?ref=v1', ''),
    ).toEqual({ owner: 'me', repo: 'brain', ref: 'v1', path: 'roster page.md' });
  });

  it('treats a bare path as a file in the second-brain repo', () => {
    expect(resolveRosterLocation('/ops/wiki/roster.md', 'me/brain')).toEqual({
      owner: 'me',
      repo: 'brain',
      path: 'ops/wiki/roster.md',
    });
  });

  it('explains what to fix', () => {
    expect(() => resolveRosterLocation('', 'me/brain')).toThrow('Set a roster URL');
    expect(() => resolveRosterLocation('roster.md', '')).toThrow('second-brain repo');
    expect(() => resolveRosterLocation('https://example.com/roster.md', '')).toThrow(RosterError);
    expect(() => resolveRosterLocation('https://github.com/me/brain', '')).toThrow(RosterError);
    expect(() => resolveRosterLocation('../x/roster.md', 'me/brain')).toThrow(RosterError);
  });
});

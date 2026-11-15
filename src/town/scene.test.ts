import { describe, expect, it } from 'vitest';
import { moonAngles, sceneAt, sunAngles, timeOverride } from './scene';

describe('sceneAt', () => {
  it('is full daylight at noon, with the sun up and shadows on', () => {
    const noon = sceneAt(12);
    expect(noon.daylight).toBe(1);
    expect(noon.night).toBe(0);
    expect(noon.sky.body).toBe('sun');
    expect(noon.shadow.alpha).toBeGreaterThan(0);
  });

  it('is night at midnight: moon up, lamps on, no shadows', () => {
    const midnight = sceneAt(0);
    expect(midnight.night).toBe(1);
    expect(midnight.sky.body).toBe('moon');
    expect(midnight.shadow.alpha).toBe(0);
  });

  it('casts morning shadows one way and evening shadows the other', () => {
    expect(sceneAt(9).shadow.dx).toBeGreaterThan(0);
    expect(sceneAt(16).shadow.dx).toBeLessThan(0);
  });

  it('blends through dusk', () => {
    const dusk = sceneAt(18.5);
    expect(dusk.night).toBeGreaterThan(0);
    expect(dusk.night).toBeLessThan(1);
  });

  it('wraps hours outside 0–24', () => {
    expect(sceneAt(36)).toEqual(sceneAt(12));
  });
});

describe('sunAngles and moonAngles', () => {
  it('rises in the east, is high in the south at midday, and sets in the west', () => {
    const morning = sunAngles(8);
    const noon = sunAngles(12.5);
    const evening = sunAngles(17);
    expect(morning.azimuth).toBeGreaterThan(Math.PI / 2);
    expect(morning.azimuth).toBeLessThan(noon.azimuth);
    expect(noon.azimuth).toBeCloseTo(Math.PI);
    expect(evening.azimuth).toBeGreaterThan(noon.azimuth);
    expect(noon.elevation).toBeGreaterThan(morning.elevation);
    expect(noon.elevation).toBeGreaterThan(evening.elevation);
  });

  it('is below the horizon at night, when the moon is up', () => {
    expect(sunAngles(0).elevation).toBeLessThan(0);
    expect(sunAngles(23).elevation).toBeLessThan(0);
    expect(moonAngles(0).elevation).toBeGreaterThan(0);
  });
});

describe('timeOverride', () => {
  it('reads ?time=HH:MM or ?time=HH', () => {
    expect(timeOverride('?time=21:30')).toBe(21.5);
    expect(timeOverride('?time=7')).toBe(7);
  });

  it('ignores missing or impossible times', () => {
    expect(timeOverride('')).toBeNull();
    expect(timeOverride('?time=25:00')).toBeNull();
    expect(timeOverride('?time=noon')).toBeNull();
  });
});

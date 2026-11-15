import { mixHex } from './color';

/**
 * The town's time of day: sky colours, how much daylight reaches the town, when lamps come on
 * and where shadows fall. Driven by the device clock unless `?time=` pins it.
 */
export interface Scene {
  skyTop: string;
  skyBottom: string;
  /** About 1 at noon and 0.45 at midnight; scales every surface colour. */
  daylight: number;
  /** 0 by day, 1 at night: lamps, window glow and stars fade in with it. */
  night: number;
  /** Shadow offset per pixel of height, in screen space; alpha is 0 while the sun is down. */
  shadow: { dx: number; dy: number; alpha: number };
  /** The sun or moon, as fractions of the canvas width and height. */
  sky: { x: number; y: number; body: 'sun' | 'moon' | 'none' };
}

interface Key {
  at: number;
  top: string;
  bottom: string;
  daylight: number;
  night: number;
}

const NIGHT: Omit<Key, 'at'> = { top: '#0b1630', bottom: '#1f2f54', daylight: 0.45, night: 1 };

const KEYS: Key[] = [
  { at: 0, ...NIGHT },
  { at: 5, ...NIGHT },
  { at: 6.25, top: '#3d5089', bottom: '#f0a57c', daylight: 0.72, night: 0.45 },
  { at: 7.5, top: '#7db1df', bottom: '#eadcbf', daylight: 0.93, night: 0 },
  { at: 12, top: '#64a3dc', bottom: '#d3e9f3', daylight: 1, night: 0 },
  { at: 16.5, top: '#6aa2d8', bottom: '#e8ddc2', daylight: 0.97, night: 0 },
  { at: 18.25, top: '#4b4f8d', bottom: '#ef8c60', daylight: 0.74, night: 0.35 },
  { at: 19.5, top: '#1e2652', bottom: '#5b4170', daylight: 0.54, night: 0.85 },
  { at: 21, ...NIGHT },
  { at: 24, ...NIGHT },
];

const SUNRISE = 6;
const SUNSET = 19;

export function sceneAt(hour: number): Scene {
  const h = ((hour % 24) + 24) % 24;
  const next = KEYS.findIndex((k) => k.at > h);
  const a = KEYS[next - 1];
  const b = KEYS[next];
  const t = (h - a.at) / (b.at - a.at);
  const night = a.night + (b.night - a.night) * t;

  const day = (h - SUNRISE) / (SUNSET - SUNRISE);
  let shadow: Scene['shadow'] = { dx: 0, dy: 0, alpha: 0 };
  let sky: Scene['sky'] = { x: 0, y: 0, body: 'none' };
  if (day > 0 && day < 1) {
    const arc = Math.sin(Math.PI * day);
    const length = 0.7 + 1.0 * (1 - arc);
    const fade = Math.min(1, Math.min(day, 1 - day) * 8);
    shadow = { dx: (0.5 - day) * 2 * length, dy: 0.32 * length, alpha: 0.24 * fade };
    sky = { x: 0.1 + 0.8 * day, y: 0.46 - 0.34 * arc, body: 'sun' };
  } else if (night > 0.3) {
    const progress = ((h < 12 ? h + 24 : h) - SUNSET) / (24 + SUNRISE - SUNSET);
    sky = { x: 0.15 + 0.7 * progress, y: 0.4 - 0.26 * Math.sin(Math.PI * progress), body: 'moon' };
  }

  return {
    skyTop: mixHex(a.top, b.top, t),
    skyBottom: mixHex(a.bottom, b.bottom, t),
    daylight: a.daylight + (b.daylight - a.daylight) * t,
    night,
    shadow,
    sky,
  };
}

export interface SkyAngles {
  /** Radians above the horizon; negative when below it. */
  elevation: number;
  /** Compass bearing in radians: 0 north, π/2 east, π south, 3π/2 west. */
  azimuth: number;
}

const SUN_HIGHEST = (62 * Math.PI) / 180;
const MOON_HIGHEST = (48 * Math.PI) / 180;

/** The sun crosses from east through south to west between sunrise and sunset. */
export function sunAngles(hour: number): SkyAngles {
  const h = ((hour % 24) + 24) % 24;
  const day = (h - SUNRISE) / (SUNSET - SUNRISE);
  return { elevation: Math.sin(Math.PI * day) * SUN_HIGHEST, azimuth: Math.PI / 2 + Math.PI * day };
}

/** The moon takes the same path across the night, from sunset to sunrise. */
export function moonAngles(hour: number): SkyAngles {
  const h = ((hour % 24) + 24) % 24;
  const night = ((h < 12 ? h + 24 : h) - SUNSET) / (24 + SUNRISE - SUNSET);
  return { elevation: Math.sin(Math.PI * night) * MOON_HIGHEST, azimuth: Math.PI / 2 + Math.PI * night };
}

export function hourOf(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

/** `?time=21:30` or `?time=7` pins the town to that hour, for example to preview it at night. */
export function timeOverride(search: string): number | null {
  const match = new URLSearchParams(search).get('time')?.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  return hours > 23 || minutes > 59 ? null : hours + minutes / 60;
}

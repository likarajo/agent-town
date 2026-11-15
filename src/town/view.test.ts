import { describe, expect, it } from 'vitest';
import { chooseView } from './view';

describe('chooseView', () => {
  it('draws the 3D town when the device can', () => {
    expect(chooseView('', true)).toBe('3d');
    expect(chooseView('?time=21:30', true)).toBe('3d');
  });

  it('falls back to the 2D map without WebGL', () => {
    expect(chooseView('', false)).toBe('2d');
  });

  it('shows the 2D map when ?view=2d asks for it', () => {
    expect(chooseView('?view=2d', true)).toBe('2d');
  });
});

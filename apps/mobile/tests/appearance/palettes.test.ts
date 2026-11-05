import { needsRestart } from '../../src/appearance/appearanceModel';
import { paletteFor } from '../../src/appearance/palettes';

describe('paletteFor', () => {
  it('keeps the Nightglass dark colours the app always had', () => {
    expect(paletteFor('dark', 'iris')).toMatchObject({ background: '#0c0d12', surface: '#13141b', raised: '#1b1c25', text: '#edeef4', accent: '#7d8dff', accentSoft: 'rgba(125, 141, 255, 0.16)', hairline: 'rgba(237, 238, 244, 0.08)' });
  });

  it('makes OLED black and keeps the dark text', () => {
    expect(paletteFor('oled', 'iris')).toMatchObject({ background: '#000000', text: '#edeef4' });
  });

  it('turns light: pale surfaces, dark text and the darker accent', () => {
    expect(paletteFor('light', 'iris')).toMatchObject({ background: '#eef0f6', text: '#171a26', accent: '#555de3', hairline: 'rgba(23, 26, 38, 0.08)' });
  });

  it('follows the accent in every theme', () => {
    expect(paletteFor('dark', 'rose').accent).toBe('#fe5c8e');
    expect(paletteFor('light', 'rose').accent).toBe('#c82462');
  });
});

describe('needsRestart', () => {
  const applied = { theme: 'dark', accent: 'iris' } as const;
  const choice = { theme: 'dark', accent: 'iris', syncOsTheme: false } as const;

  it('is false while the choice is what is on screen', () => {
    expect(needsRestart(applied, choice, 'dark')).toBe(false);
  });

  it('is true for another theme or accent', () => {
    expect(needsRestart(applied, { ...choice, theme: 'light' }, 'dark')).toBe(true);
    expect(needsRestart(applied, { ...choice, accent: 'sky' }, 'dark')).toBe(true);
  });

  it('follows the iPhone when asked to', () => {
    expect(needsRestart(applied, { ...choice, syncOsTheme: true }, 'light')).toBe(true);
    expect(needsRestart(applied, { ...choice, syncOsTheme: true }, 'dark')).toBe(false);
    expect(needsRestart({ theme: 'oled', accent: 'iris' }, { ...choice, theme: 'oled', syncOsTheme: true }, 'dark')).toBe(false);
  });
});

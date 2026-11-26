import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../storage/progress-store';
import { createThemePreference, THEME_KEY } from '../storage/theme-preference';
import { applyTheme, followTheme, getThemeChoice, resolveTheme, setThemeChoice, startTheme, THEME_CHROME } from './theme';
import type { ThemeDocument, ThemeMedia } from './theme';

/** Just enough of a document: the root element's data-theme and the head's meta tags. */
function fakeDocument(): ThemeDocument & { theme(): string | undefined; meta(name: string): string | null } {
  const metas = new Map<string, string>([
    ['theme-color', '#000000'],
    ['color-scheme', 'dark'],
    ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
  ]);
  const dataset: Record<string, string | undefined> = {};
  return {
    documentElement: { dataset } as unknown as HTMLElement,
    querySelector: ((selector: string) => {
      const name = selector.match(/^meta\[name="([^"]+)"\]$/)?.[1];
      if (!name || !metas.has(name)) return null;
      return { setAttribute: (_attr: string, value: string) => metas.set(name, value) } as unknown as Element;
    }) as ThemeDocument['querySelector'],
    theme: () => dataset.theme,
    meta: (name) => metas.get(name) ?? null,
  };
}

/** A prefers-color-scheme: light query the test can flip, as the phone does at sunset. */
function fakeMedia(light: boolean): ThemeMedia & { flip(light: boolean): void; listeners(): number } {
  const listeners = new Set<() => void>();
  const media = {
    matches: light,
    addEventListener: (_type: 'change', fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: 'change', fn: () => void) => listeners.delete(fn),
    flip(next: boolean) {
      media.matches = next;
      for (const fn of listeners) fn();
    },
    listeners: () => listeners.size,
  };
  return media;
}

const memoryStore = (): KeyValueStore => {
  const data: Record<string, string> = {};
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe('resolving the theme', () => {
  it('follows the system appearance when the choice is system', () => {
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });

  it('keeps a pinned theme whatever the system says', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });
});

describe('applying a theme', () => {
  it('sets the root theme and keeps browser chrome and the status bar in step', () => {
    const doc = fakeDocument();
    applyTheme(doc, 'light');
    expect(doc.theme()).toBe('light');
    expect(doc.meta('theme-color')).toBe(THEME_CHROME.light.themeColor);
    expect(doc.meta('color-scheme')).toBe('light');
    expect(doc.meta('apple-mobile-web-app-status-bar-style')).toBe(THEME_CHROME.light.statusBar);

    applyTheme(doc, 'dark');
    expect(doc.theme()).toBe('dark');
    expect(doc.meta('theme-color')).toBe(THEME_CHROME.dark.themeColor);
    expect(doc.meta('color-scheme')).toBe('dark');
    expect(doc.meta('apple-mobile-web-app-status-bar-style')).toBe(THEME_CHROME.dark.statusBar);
  });

  it('light chrome uses dark status-bar text; dark chrome keeps the page running under the status bar', () => {
    expect(THEME_CHROME.light.statusBar).toBe('default');
    expect(THEME_CHROME.dark.statusBar).toBe('black-translucent');
  });
});

describe('following the theme', () => {
  it('switches live when the system appearance changes, without a reload', () => {
    const doc = fakeDocument();
    const media = fakeMedia(false);
    followTheme({ doc, media, preference: createThemePreference(memoryStore()) });
    expect(doc.theme()).toBe('dark');
    media.flip(true);
    expect(doc.theme()).toBe('light');
    expect(doc.meta('theme-color')).toBe(THEME_CHROME.light.themeColor);
    media.flip(false);
    expect(doc.theme()).toBe('dark');
  });

  it('a pinned choice applies at once, survives the system changing, and is stored', () => {
    const doc = fakeDocument();
    const media = fakeMedia(false);
    const store = memoryStore();
    const theme = followTheme({ doc, media, preference: createThemePreference(store) });
    theme.choose('light');
    expect(doc.theme()).toBe('light');
    media.flip(false);
    expect(doc.theme()).toBe('light');
    expect(store.getItem(THEME_KEY)).toBe('light');
    expect(theme.choice()).toBe('light');
    expect(theme.theme()).toBe('light');
  });

  it('starts from the stored choice and goes back to the system when asked', () => {
    const doc = fakeDocument();
    const media = fakeMedia(true);
    const preference = createThemePreference(memoryStore());
    preference.save('dark');
    const theme = followTheme({ doc, media, preference });
    expect(doc.theme()).toBe('dark');
    theme.choose('system');
    expect(doc.theme()).toBe('light');
    expect(preference.load()).toBe('system');
  });

  it('stops listening when disposed', () => {
    const media = fakeMedia(false);
    const theme = followTheme({ doc: fakeDocument(), media, preference: createThemePreference(memoryStore()) });
    expect(media.listeners()).toBe(1);
    theme.dispose();
    expect(media.listeners()).toBe(0);
  });
});

describe('the app-wide theme choice (for the settings screen)', () => {
  it('reads and sets the choice of the running app', () => {
    const doc = fakeDocument();
    const media = fakeMedia(false);
    const preference = createThemePreference(memoryStore());
    startTheme({ doc, media, preference });
    expect(getThemeChoice()).toBe('system');
    setThemeChoice('light');
    expect(getThemeChoice()).toBe('light');
    expect(doc.theme()).toBe('light');
    expect(preference.load()).toBe('light');
    setThemeChoice('system');
    expect(doc.theme()).toBe('dark');
  });

  it('starting again replaces the old listener rather than adding a second', () => {
    const media = fakeMedia(false);
    const preference = createThemePreference(memoryStore());
    startTheme({ doc: fakeDocument(), media, preference });
    startTheme({ doc: fakeDocument(), media, preference });
    expect(media.listeners()).toBe(1);
  });
});

describe('the theme before first paint (inline script in index.html)', () => {
  const html = Object.values(import.meta.glob('/index.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0] ?? '';
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';

  /** Run the inline script against a fake page, as the browser would while parsing the head. */
  const runInline = (stored: string | null, systemLight: boolean, storageThrows = false) => {
    const doc = fakeDocument();
    const localStorage = {
      getItem: (key: string) => {
        if (storageThrows) throw new Error('blocked');
        return key === THEME_KEY ? stored : null;
      },
    };
    const matchMedia = (query: string) => ({ matches: query === '(prefers-color-scheme: light)' && systemLight });
    new Function('document', 'localStorage', 'matchMedia', script)(doc, localStorage, matchMedia);
    return doc;
  };

  it('is in the head, before the app script', () => {
    expect(script.length).toBeGreaterThan(0);
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'));
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('src="/src/main.tsx"'));
  });

  const cases: Array<[string | null, boolean, 'light' | 'dark']> = [
    [null, true, 'light'],
    [null, false, 'dark'],
    ['system', true, 'light'],
    ['light', false, 'light'],
    ['dark', true, 'dark'],
    ['sepia', true, 'light'],
  ];
  for (const [stored, systemLight, expected] of cases) {
    it(`stored ${stored ?? 'nothing'}, system ${systemLight ? 'light' : 'dark'}: paints ${expected}, exactly as the app would`, () => {
      const inline = runInline(stored, systemLight);
      const app = fakeDocument();
      applyTheme(app, expected);
      expect(inline.theme()).toBe(expected);
      for (const name of ['theme-color', 'color-scheme', 'apple-mobile-web-app-status-bar-style']) {
        expect(inline.meta(name), name).toBe(app.meta(name));
      }
    });
  }

  it('falls back to the system when storage is blocked', () => {
    expect(runInline(null, true, true).theme()).toBe('light');
  });
});

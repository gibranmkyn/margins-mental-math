import { createThemePreference } from '../storage/theme-preference';
import type { ThemeChoice, ThemePreference } from '../storage/theme-preference';

/**
 * Light or dark. The colours live in parts/tokens.css under :root[data-theme]; this module only
 * decides which one is active and keeps the browser chrome in step. The inline script in
 * index.html does the same before first paint (theme.test.ts checks they agree).
 */
export type Theme = 'light' | 'dark';
export type { ThemeChoice };

export const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** Browser chrome per theme: the page colour (--ink in tokens.css) and the iOS status bar. */
export const THEME_CHROME: Record<Theme, { themeColor: string; statusBar: string }> = {
  // Installed, the page runs under a translucent status bar with light text.
  dark: { themeColor: '#12100b', statusBar: 'black-translucent' },
  // Light text would vanish on paper: iOS draws its own bar with dark text instead.
  light: { themeColor: '#ffffff', statusBar: 'default' },
};

export type ThemeDocument = Pick<Document, 'documentElement' | 'querySelector'>;
export type ThemeMedia = Pick<MediaQueryList, 'matches'> & {
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
};

export function resolveTheme(choice: ThemeChoice, systemLight: boolean): Theme {
  if (choice === 'system') return systemLight ? 'light' : 'dark';
  return choice;
}

export function applyTheme(doc: ThemeDocument, theme: Theme): void {
  doc.documentElement.dataset.theme = theme;
  const set = (name: string, content: string) => doc.querySelector(`meta[name="${name}"]`)?.setAttribute('content', content);
  set('theme-color', THEME_CHROME[theme].themeColor);
  set('color-scheme', theme);
  set('apple-mobile-web-app-status-bar-style', THEME_CHROME[theme].statusBar);
}

export interface ThemeController {
  /** What the owner chose: system, light or dark. */
  choice(): ThemeChoice;
  /** What is showing now. */
  theme(): Theme;
  /** Store a new choice and apply it at once. */
  choose(choice: ThemeChoice): void;
  dispose(): void;
}

export interface ThemeOptions {
  doc?: ThemeDocument;
  media?: ThemeMedia;
  preference?: ThemePreference;
}

/** Applies the stored choice and, while it is "system", follows the phone's appearance live. */
export function followTheme({ doc = document, media = matchMedia(LIGHT_QUERY), preference = createThemePreference() }: ThemeOptions = {}): ThemeController {
  let choice = preference.load();
  let theme = resolveTheme(choice, media.matches);
  const update = () => {
    theme = resolveTheme(choice, media.matches);
    applyTheme(doc, theme);
  };
  media.addEventListener('change', update);
  update();
  return {
    choice: () => choice,
    theme: () => theme,
    choose(next) {
      choice = next;
      preference.save(next);
      update();
    },
    dispose: () => media.removeEventListener('change', update),
  };
}

let running: ThemeController | null = null;

/** Called once by the app at start-up. */
export function startTheme(options?: ThemeOptions): ThemeController {
  running?.dispose();
  running = followTheme(options);
  return running;
}

/** The owner's appearance choice, for the settings screen. */
export function getThemeChoice(): ThemeChoice {
  return running ? running.choice() : createThemePreference().load();
}

/** Store and apply a new appearance choice, for the settings screen. */
export function setThemeChoice(choice: ThemeChoice): void {
  if (running) running.choose(choice);
  else createThemePreference().save(choice);
}

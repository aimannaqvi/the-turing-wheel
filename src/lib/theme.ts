export const THEME_STORAGE_KEY = "ttw-theme";

export type Theme = "light" | "dusk";

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dusk";
}

export function applyTheme(theme: Theme) {
  if (theme === "dusk") {
    document.documentElement.dataset.theme = "dusk";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "light";
  } catch {
    return "light";
  }
}

export function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

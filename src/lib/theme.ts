/** User theme preference. `system` follows the OS setting on the client. */
export type ThemePreference = "dark" | "light" | "system";

/** Cookie name holding the theme preference. */
export const THEME_COOKIE = "s3m_theme";

/** Default preference; the product ships dark-first. */
export const DEFAULT_THEME: ThemePreference = "dark";

/** Narrows an arbitrary cookie value to a valid preference. */
export function parseTheme(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : DEFAULT_THEME;
}

/**
 * Resolves whether to render dark for the initial SSR paint.
 *
 * `system` cannot be detected on the server, so it falls back to dark to match
 * the product default and avoid a flash for the common case.
 */
export function isInitialDark(preference: ThemePreference): boolean {
  return preference !== "light";
}

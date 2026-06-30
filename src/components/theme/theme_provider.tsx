"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { DEFAULT_THEME, THEME_COOKIE } from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme";

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeSystemDark(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSystemDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** Provides theme state and persists the preference to a cookie. */
export function ThemeProvider({
  initialPreference,
  children,
}: {
  initialPreference: ThemePreference;
  children: ReactNode;
}) {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(initialPreference);

  // System preference is an external store; reading it this way avoids
  // synchronous setState inside an effect.
  const systemDark = useSyncExternalStore(
    subscribeSystemDark,
    getSystemDark,
    () => initialPreference !== "light",
  );

  const isDark = useMemo(() => {
    if (preference === "system") {
      return systemDark;
    }
    return preference === "dark";
  }, [preference, systemDark]);

  // Side effect only: reflect the resolved theme onto the document element.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${maxAge}; samesite=lax`;
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, setPreference, isDark }),
    [preference, setPreference, isDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Accesses the theme context; throws when used outside the provider. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

/** Re-exported for convenience at call sites. */
export const FALLBACK_THEME = DEFAULT_THEME;

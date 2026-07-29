"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ClientOnly, Icon, IconButton, SegmentGroup } from "@chakra-ui/react";
import { useTheme } from "next-themes";

/** User theme preference. `system` follows the OS setting. */
export type ThemePreference = "dark" | "light" | "system";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Top-bar control that flips between dark and light.
 *
 * Wrapped in `ClientOnly` because the resolved mode is unknown during SSR;
 * rendering the icon straight away would mismatch on hydration.
 */
export function ColorModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";
  return (
    <ClientOnly fallback={<IconButton variant="ghost" size="sm" disabled />}>
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={label}
        title={label}
        onClick={() => setTheme(isDark ? "light" : "dark")}
      >
        <Icon size="sm" asChild>
          {isDark ? <Sun /> : <Moon />}
        </Icon>
      </IconButton>
    </ClientOnly>
  );
}

/** Segmented control for the dark/light/system preference. */
export function ColorModeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <ClientOnly fallback={null}>
      <SegmentGroup.Root
        value={theme ?? "system"}
        onValueChange={({ value }) => {
          if (value) {
            setTheme(value);
          }
        }}
        size="sm"
      >
        <SegmentGroup.Indicator />
        {OPTIONS.map((option) => (
          <SegmentGroup.Item key={option.value} value={option.value}>
            <SegmentGroup.ItemText display="flex" alignItems="center" gap="1.5">
              <Icon size="sm" asChild>
                <option.icon />
              </Icon>
              {option.label}
            </SegmentGroup.ItemText>
            <SegmentGroup.ItemHiddenInput />
          </SegmentGroup.Item>
        ))}
      </SegmentGroup.Root>
    </ClientOnly>
  );
}

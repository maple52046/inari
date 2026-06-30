"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "./theme_provider";
import { cn } from "@/lib/cn";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

/** Segmented control for the dark/light/system theme preference. */
export function ThemeSelector() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="border-border inline-flex rounded-md border p-1">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setPreference(option.value)}
            aria-pressed={active}
            className={cn(
              "flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

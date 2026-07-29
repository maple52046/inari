"use client";

import type { ReactNode } from "react";
import { ChakraProvider } from "@chakra-ui/react";
import { ThemeProvider } from "next-themes";
import { system } from "@/theme/system";
import { Toaster } from "@/components/ui/toast";
import { EmotionCacheProvider } from "./emotion_cache_provider";

/**
 * Root client boundary wiring the design system and colour mode.
 *
 * `defaultTheme` is pinned to dark because the product ships dark-first and
 * advertises it on the settings screen; next-themes would otherwise default to
 * following the OS and silently change that behaviour.
 *
 * The Emotion cache has to wrap `ChakraProvider`, since it is Chakra's `<Global>`
 * elements whose server-side output needs hoisting into the head.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <EmotionCacheProvider>
      <ChakraProvider value={system}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </ChakraProvider>
    </EmotionCacheProvider>
  );
}

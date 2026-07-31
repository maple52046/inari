"use client";

import type { ReactNode } from "react";
import { ChakraProvider } from "@chakra-ui/react";
import { ThemeProvider } from "next-themes";
import { system } from "@/theme/system";
import { Toaster } from "@/components/ui/toast";

/**
 * Root client boundary wiring the design system and colour mode.
 *
 * `defaultTheme` is pinned to dark because the product ships dark-first and
 * advertises it on the settings screen; next-themes would otherwise default to
 * following the OS and silently change that behaviour.
 *
 * There is no Emotion cache provider: it existed only to hoist server-rendered
 * `<Global>` output into the head, and nothing renders on the server now.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  return (
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
  );
}

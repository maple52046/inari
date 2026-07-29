import localFont from "next/font/local";

/**
 * Display face used for headings and the wordmark.
 *
 * Only the Latin subset is vendored. The full family carries Japanese glyphs and
 * runs to several megabytes, which the product does not need because every
 * heading it renders is Latin text. Rendering Japanese headings would require
 * revisiting this.
 */
export const display = localFont({
  src: [
    {
      path: "./fonts/zen-kaku-gothic-new-500-latin.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/zen-kaku-gothic-new-700-latin.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-display",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/** Body face for all UI text. */
export const sans = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  weight: "100 900",
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

/** Monospace face for object keys and other verbatim identifiers. */
export const mono = localFont({
  src: "./fonts/jetbrains-mono-latin-variable.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
});

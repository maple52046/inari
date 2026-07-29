import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/**
 * Design system for the app, carrying the pre-Chakra colour scheme forward.
 *
 * The values below are not a new palette: they are the tokens the app used
 * before this migration, restated in Chakra's token model so that moving to
 * Chakra does not change a single rendered colour.
 */
const config = defineConfig({
  globalCss: {
    // Setting the palette on the root makes it the default for every
    // colorPalette-aware recipe, so call sites never repeat colorPalette="brand".
    html: {
      colorPalette: "brand",
    },
    body: {
      // Digits appear in size and object-count columns that must align across
      // rows, which proportional figures break.
      fontVariantNumeric: "tabular-nums",
    },
  },
  theme: {
    tokens: {
      fonts: {
        heading: { value: "var(--font-display)" },
        body: { value: "var(--font-sans)" },
        mono: { value: "var(--font-mono)" },
      },
      colors: {
        // Ramp interpolated along the previous scheme's hue 265. Steps 500 and
        // 400 are the untouched light and dark `--primary`, which is what makes
        // `brand.solid` reproduce the old colour exactly rather than approximate
        // it.
        brand: {
          50: { value: "oklch(0.97 0.02 265)" },
          100: { value: "oklch(0.94 0.04 265)" },
          200: { value: "oklch(0.88 0.07 265)" },
          300: { value: "oklch(0.8 0.11 265)" },
          400: { value: "oklch(0.68 0.16 265)" },
          500: { value: "oklch(0.55 0.18 265)" },
          600: { value: "oklch(0.48 0.17 265)" },
          700: { value: "oklch(0.4 0.15 265)" },
          800: { value: "oklch(0.32 0.12 265)" },
          900: { value: "oklch(0.25 0.09 265)" },
          950: { value: "oklch(0.18 0.05 265)" },
        },
        // Overriding `gray` instead of each neutral semantic token is the point
        // of leverage: Chakra resolves `bg`, `fg`, `border`, their
        // subtle/muted/emphasized variants, and even the elevation shadows
        // through `{colors.gray.*}`. Fixing the palette keeps tokens this app
        // never names explicitly on the project's cool-tinted neutral rather
        // than silently falling back to Chakra's default grey.
        gray: {
          50: { value: "oklch(0.98 0.003 260)" },
          100: { value: "oklch(0.96 0.005 260)" },
          200: { value: "oklch(0.9 0.005 260)" },
          300: { value: "oklch(0.86 0.006 260)" },
          400: { value: "oklch(0.68 0.01 260)" },
          500: { value: "oklch(0.58 0.01 260)" },
          600: { value: "oklch(0.48 0.01 260)" },
          700: { value: "oklch(0.32 0.012 260)" },
          800: { value: "oklch(0.3 0.012 260)" },
          900: { value: "oklch(0.26 0.012 260)" },
          950: { value: "oklch(0.21 0.012 260)" },
        },
        // Same reasoning as `gray`: the destructive colour has to reach both
        // colorPalette="red" call sites and the bg.error/fg.error semantic
        // tokens, and both route through this palette.
        red: {
          50: { value: "oklch(0.96 0.02 25)" },
          100: { value: "oklch(0.92 0.05 25)" },
          200: { value: "oklch(0.85 0.09 25)" },
          300: { value: "oklch(0.75 0.14 25)" },
          400: { value: "oklch(0.68 0.18 25)" },
          500: { value: "oklch(0.62 0.2 25)" },
          600: { value: "oklch(0.58 0.21 25)" },
          700: { value: "oklch(0.45 0.17 25)" },
          800: { value: "oklch(0.36 0.13 25)" },
          900: { value: "oklch(0.28 0.1 25)" },
          950: { value: "oklch(0.19 0.06 25)" },
        },
      },
      radii: {
        // Carried over from the previous `--radius: 0.625rem` and its -2px/-4px
        // derivations.
        xs: { value: "0.375rem" },
        sm: { value: "0.5rem" },
        md: { value: "0.625rem" },
      },
    },
    semanticTokens: {
      colors: {
        brand: {
          solid: {
            value: {
              _light: "{colors.brand.500}",
              _dark: "{colors.brand.400}",
            },
          },
          contrast: {
            value: {
              _light: "oklch(0.99 0 0)",
              _dark: "oklch(0.16 0.01 260)",
            },
          },
          fg: {
            value: {
              _light: "{colors.brand.700}",
              _dark: "{colors.brand.300}",
            },
          },
          muted: {
            value: {
              _light: "{colors.brand.100}",
              _dark: "{colors.brand.900}",
            },
          },
          subtle: {
            value: { _light: "{colors.brand.50}", _dark: "{colors.brand.950}" },
          },
          emphasized: {
            value: {
              _light: "{colors.brand.200}",
              _dark: "{colors.brand.800}",
            },
          },
          focusRing: {
            value: {
              _light: "{colors.brand.500}",
              _dark: "{colors.brand.400}",
            },
          },
        },
        // The two surfaces the gray ramp cannot express: the old `--background`
        // was slightly off-white in light mode and a raised neutral in dark
        // mode, neither of which is a ramp step.
        bg: {
          DEFAULT: {
            value: {
              _light: "oklch(0.99 0 0)",
              _dark: "oklch(0.17 0.01 260)",
            },
          },
          panel: {
            value: { _light: "oklch(1 0 0)", _dark: "{colors.gray.950}" },
          },
        },
        fg: {
          DEFAULT: {
            value: {
              _light: "oklch(0.18 0.01 260)",
              _dark: "oklch(0.95 0.005 260)",
            },
          },
        },
        red: {
          solid: {
            value: { _light: "{colors.red.600}", _dark: "{colors.red.500}" },
          },
        },
      },
    },
  },
});

/** Chakra system consumed by the root provider. */
export const system = createSystem(defaultConfig, config);

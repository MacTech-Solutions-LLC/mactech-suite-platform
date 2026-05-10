import type { Config } from "tailwindcss";
import { mactechPreset } from "@mactech-solutions-llc/design-tokens";

// Sprint 52 — Vivid token system migrated from inline values to the
// published @mactech-solutions-llc/design-tokens preset. The preset
// wires every `mt-*` color/font/radius/shadow/easing utility to a
// CSS variable declared by the active mood file. Mood files live at
//   node_modules/@mactech-solutions-llc/design-tokens/dist/moods/<name>.css
// and are activated by setting `data-mt-mood` on an ancestor.
//
// What stays inline below:
//  • Existing shadcn HSL tokens (background/foreground/etc.) that
//    every non-command-center admin route uses.
//  • Backwards-compat aliases — `mt-cyan` / `mt-violet` / `mt-magenta`
//    / `mt-lime` / `mt-amber` / `mt-rose` / `mt-hairline-strong` /
//    `font-mt-display` — pointing at the preset's canonical names so
//    Sprint 44/45/46/50/51 components keep rendering unchanged.
//  • Sprint 44 keyframes/animations (`mt-spin-slow`, `mt-pulse-glow`,
//    `mt-rise`, `mt-shimmer`) — the preset doesn't ship animations.
const config: Config = {
  presets: [mactechPreset],
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        // Backwards-compat: existing components reference font-mt-display.
        // The preset provides font-mt-sans; alias display → sans here.
        "mt-display": ["var(--mt-font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // shadcn HSL tokens — unchanged for non-command-center routes.
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        // Backwards-compat aliases for Sprint 44 component code that
        // still references the original semantic names. The preset
        // provides the canonical mt-accent / mt-accent-2 / etc.
        "mt-cyan":    "var(--mt-accent)",
        "mt-violet":  "var(--mt-accent-2)",
        "mt-magenta": "var(--mt-accent-3)",
        "mt-lime":    "var(--mt-success)",
        "mt-amber":   "var(--mt-warning)",
        "mt-rose":    "var(--mt-danger)",
        "mt-hairline-strong": "var(--mt-hairline-3)",
        // Sprint 44 also exposed mt-bg-3 at #10131D; preset uses
        // #0E1120 for the same role. Override here for visual parity
        // with the existing Vivid screens.
        "mt-bg-3": "#10131D",
      },
      backdropBlur: {
        "mt-glass": "24px",
      },
      boxShadow: {
        // Sprint 44 — Vivid glow utilities for CTAs / focused tiles.
        // Continue exposing these names; the preset's mt-glow / mt-glow-2
        // cover the same role for new code.
        "mt-cyan": "0 0 0 1px rgba(0, 229, 255, 0.35), 0 8px 24px -6px rgba(0, 229, 255, 0.45)",
        "mt-violet": "0 0 0 1px rgba(124, 92, 255, 0.35), 0 8px 24px -6px rgba(124, 92, 255, 0.45)",
        "mt-magenta": "0 0 0 1px rgba(255, 91, 208, 0.35), 0 8px 24px -6px rgba(255, 91, 208, 0.45)",
        "mt-glass": "0 1px 0 0 rgba(255, 255, 255, 0.06) inset, 0 24px 48px -24px rgba(0, 0, 0, 0.6)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Sprint 44 — Vivid keyframes.
        "mt-spin-slow":  { to: { transform: "rotate(360deg)" } },
        "mt-pulse-glow": { "0%, 100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
        "mt-rise":       { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "mt-shimmer":    { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        "mt-spin-slow":   "mt-spin-slow 8s linear infinite",
        "mt-pulse-glow":  "mt-pulse-glow 3s ease-in-out infinite",
        "mt-rise":        "mt-rise 480ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "mt-shimmer":     "mt-shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;

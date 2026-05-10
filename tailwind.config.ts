import type { Config } from "tailwindcss";

const config: Config = {
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
        // Sprint 44 — Vivid scope (/command-center). Wired in app/layout.tsx
        // via next/font/google so the .variable classes resolve here.
        "mt-display": ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        "mt-mono": ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        "mt-serif": ["var(--font-instrument-serif)", "ui-serif", "Georgia", "serif"],
      },
      colors: {
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
        // ── Sprint 44 — Vivid (/command-center only) ─────────────────
        // Cyan/violet/magenta system from the Stream OS reference.
        // Other admin routes don't use these classes — palette stays
        // scoped by usage, not by build target.
        "mt-bg": "#06070C",
        "mt-bg-2": "#0A0C14",
        "mt-bg-3": "#10131D",
        "mt-surface-1": "rgba(255, 255, 255, 0.04)",
        "mt-surface-2": "rgba(255, 255, 255, 0.06)",
        "mt-surface-3": "rgba(255, 255, 255, 0.08)",
        "mt-surface-4": "rgba(255, 255, 255, 0.10)",
        "mt-hairline": "rgba(255, 255, 255, 0.08)",
        "mt-hairline-strong": "rgba(255, 255, 255, 0.14)",
        "mt-text": "#F4F6FB",
        "mt-text-2": "#C8CEDB",
        "mt-text-3": "#8C93A4",
        "mt-text-4": "#5D6373",
        "mt-cyan": "#00E5FF",
        "mt-violet": "#7C5CFF",
        "mt-magenta": "#FF5BD0",
        "mt-lime": "#B6FF6E",
        "mt-amber": "#FFB454",
        "mt-rose": "#FF6679",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Sprint 44 — Vivid radii (used inside /command-center).
        "mt-1": "8px",
        "mt-2": "12px",
        "mt-3": "16px",
        "mt-4": "20px",
        "mt-5": "28px",
      },
      transitionTimingFunction: {
        // Sprint 44 — Vivid motion easings.
        "mt-out": "cubic-bezier(0.16, 1, 0.3, 1)",
        "mt-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      backdropBlur: {
        "mt-glass": "24px",
      },
      boxShadow: {
        // Sprint 44 — Vivid glow utilities for CTAs / focused tiles.
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
        "mt-spin-slow": {
          to: { transform: "rotate(360deg)" },
        },
        "mt-pulse-glow": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        "mt-rise": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "mt-shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "mt-spin-slow": "mt-spin-slow 8s linear infinite",
        "mt-pulse-glow": "mt-pulse-glow 3s ease-in-out infinite",
        "mt-rise": "mt-rise 480ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "mt-shimmer": "mt-shimmer 6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;

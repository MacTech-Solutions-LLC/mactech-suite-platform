"use client";

/**
 * Chip — a togglable pill-shaped button used for scope pickers, cron
 * presets, intent templates, and tab toggles. Matches Badge's silhouette
 * but is interactive: keyboard-focusable with a visible ring, exposes
 * `aria-pressed`, and never relies on `title` for the label.
 *
 * Co-located with the rest of the design system. There is no global
 * Chip use case yet — keep this scoped to the AgentOps surfaces until
 * a second consumer shows up.
 */

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  // Base: focus-visible ring matches Button's story so keyboard nav is
  // consistent across the app. `transition-colors` only — no scale.
  "inline-flex items-center gap-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Selected state uses the existing primary tinted recipe; brief
        // verified contrast for `text-primary` on `bg-primary/15`.
        default:
          "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary aria-pressed:border-primary aria-pressed:bg-primary/15 aria-pressed:text-primary",
        // Same as default but the unselected state uses transparent fill
        // so chip rows over `bg-card/40` containers don't read as filled.
        ghost:
          "border-border bg-transparent text-muted-foreground hover:bg-secondary/40 aria-pressed:border-primary aria-pressed:bg-primary/15 aria-pressed:text-primary",
        // For the curl/python tab toggle on ClaudeToolSpec — looks like a
        // segmented control, not a pill.
        tab: "border-transparent rounded-md text-muted-foreground hover:bg-secondary/40 aria-pressed:bg-secondary aria-pressed:text-foreground",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        xs: "px-2 py-0.5 text-[10px]",
        // Mono variant for cron exprs / repo full names.
        mono: "px-2 py-0.5 font-mono text-[10px]",
      },
    },
    defaultVariants: { variant: "default", size: "sm" },
  },
);

export interface ChipProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title">,
    VariantProps<typeof chipVariants> {
  /** Whether the chip is currently selected. Wires `aria-pressed`. */
  pressed?: boolean;
  /** Accessible name; required when the visible content is icon-only. */
  ariaLabel?: string;
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, variant, size, pressed, ariaLabel, type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        className={cn(chipVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Chip.displayName = "Chip";

export { Chip, chipVariants };

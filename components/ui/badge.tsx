import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/15 text-primary",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        destructive:
          "border-transparent bg-destructive/15 text-destructive",
        success:
          "border-transparent bg-success/15 text-[hsl(142_71%_55%)]",
        warning:
          "border-transparent bg-warning/15 text-[hsl(38_92%_60%)]",
        // `refused` is the IBE-invariant-violation terminal state. It is
        // intentionally distinct from `warning` (which is "awaiting human
        // action"): no fill, only a tinted border, so it reads as
        // "contract did not hold" rather than "needs your attention".
        refused:
          "border-warning/60 bg-transparent text-[hsl(38_92%_75%)]",
        outline: "border-border text-foreground",
        muted: "border-border bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

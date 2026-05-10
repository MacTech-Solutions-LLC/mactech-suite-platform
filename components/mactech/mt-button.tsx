import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import { type ButtonHTMLAttributes, forwardRef } from "react";

const mtButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-mt-2 font-mt-mono text-xs uppercase tracking-wider transition-[transform,box-shadow,background] duration-200 ease-mt-spring will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mt-accent focus-visible:ring-offset-2 focus-visible:ring-offset-mt-bg disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[linear-gradient(135deg,var(--mt-accent),var(--mt-accent-2))] text-mt-on-accent shadow-mt-glow hover:-translate-y-0.5 hover:shadow-[0_0_36px_var(--mt-glow)]",
        ghost:
          "border border-mt-hairline bg-mt-surface-1 text-mt-text hover:border-mt-hairline-2 hover:bg-mt-surface-2",
        danger:
          "bg-mt-danger/10 border border-mt-danger/40 text-mt-danger hover:bg-mt-danger/20",
        outline:
          "border border-mt-hairline-2 bg-transparent text-mt-text hover:bg-mt-surface-2",
      },
      size: {
        sm: "h-8 px-3 text-[10px]",
        md: "h-9 px-4",
        lg: "h-10 px-5 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface MtButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof mtButtonVariants> {
  asChild?: boolean;
}

export const MtButton = forwardRef<HTMLButtonElement, MtButtonProps>(
  function MtButton(
    { className = "", variant, size, asChild = false, ...rest },
    ref,
  ) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={`${mtButtonVariants({ variant, size })} ${className}`}
        {...rest}
      />
    );
  },
);

export { mtButtonVariants };

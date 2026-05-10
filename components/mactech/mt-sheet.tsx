"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetPortal = DialogPrimitive.Portal;
const SheetClose = DialogPrimitive.Close;

const SheetOverlay = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function SheetOverlay({ className = "", ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={`fixed inset-0 z-40 bg-mt-bg/70 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 ${className}`}
      {...props}
    />
  );
});

interface SheetContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "right" | "left";
  width?: number;
}

const SheetContent = forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(function SheetContent(
  { className = "", side = "right", width = 520, children, style, ...props },
  ref,
) {
  const sidePos = side === "right"
    ? "right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
    : "left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left";
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={`fixed inset-y-0 z-50 flex h-full flex-col gap-4 border-l border-mt-hairline bg-mt-bg-2 p-6 shadow-mt-glow transition-transform duration-300 ease-mt-out data-[state=open]:animate-in data-[state=closed]:animate-out ${sidePos} ${className}`}
        style={{ width, ...style }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-mt-1 p-1 text-mt-text-3 hover:bg-mt-surface-3 hover:text-mt-text">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});

function SheetHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1 border-b border-mt-hairline pb-4">
      {eyebrow ? (
        <p className="font-mt-mono text-[10px] uppercase tracking-[0.2em] text-mt-text-3">
          {eyebrow}
        </p>
      ) : null}
      <DialogPrimitive.Title className="font-mt-sans text-lg font-semibold tracking-tight text-mt-text">
        {title}
      </DialogPrimitive.Title>
      {description ? (
        <DialogPrimitive.Description className="font-mt-sans text-sm text-mt-text-2">
          {description}
        </DialogPrimitive.Description>
      ) : null}
    </div>
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetPortal,
  SheetOverlay,
};

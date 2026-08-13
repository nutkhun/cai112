import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // --- Mobile (default): a bottom sheet -------------------------------
        // Anchored to the bottom edge so it sits under the thumb, capped in
        // height and independently scrollable so a tall form never pushes its
        // action buttons off-screen. dvh (not vh) keeps it correct while
        // mobile Safari's URL bar collapses.
        "fixed inset-x-0 bottom-0 z-50 grid w-full gap-4 rounded-t-2xl border border-b-0 bg-background p-5 shadow-lg duration-200",
        "max-h-[92dvh] overflow-y-auto overscroll-contain",
        "pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        // --- sm and up: the original centred dialog --------------------------
        "sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%]",
        "sm:max-h-[85vh] sm:rounded-lg sm:border-b sm:p-6 sm:pb-6",
        "sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
        "sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]",
        "sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%]",
        className,
      )}
      {...props}
    >
      {/* Grab handle: signals "this is a sheet you can dismiss". Phones only. */}
      <div
        aria-hidden
        className="mx-auto -mt-1 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25 sm:hidden"
      />
      {children}
      <DialogPrimitive.Close className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full opacity-70 ring-offset-background transition-opacity hover:bg-muted hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:text-muted-foreground sm:right-4 sm:top-4 sm:h-8 sm:w-8">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  // pr-10 keeps long titles clear of the absolutely-positioned close button.
  <div className={cn("flex flex-col space-y-1.5 pr-10 text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // Stacked and full-width on phones (primary action nearest the thumb),
      // right-aligned row from sm up.
      "flex flex-col-reverse gap-2 [&>button]:w-full",
      "sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2 sm:[&>button]:w-auto",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};

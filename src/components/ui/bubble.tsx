import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

function BubbleGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble-group"
      className={cn("ui-bubble-group", className)}
      {...props}
    />
  );
}

const bubbleVariants = cva("ui-bubble", {
  variants: {
    variant: {
      default: "ui-bubble-default",
      secondary: "ui-bubble-secondary",
      muted: "ui-bubble-muted",
      tinted: "ui-bubble-tinted",
      outline: "ui-bubble-outline",
      ghost: "ui-bubble-ghost",
      destructive: "ui-bubble-destructive",
    },
    align: {
      start: "ui-bubble-start",
      end: "ui-bubble-end",
    },
  },
  defaultVariants: {
    variant: "default",
    align: "start",
  },
});

function Bubble({
  variant = "default",
  align = "start",
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof bubbleVariants>) {
  return (
    <div
      data-slot="bubble"
      data-variant={variant}
      data-align={align}
      className={cn(bubbleVariants({ variant, align, className }))}
      {...props}
    />
  );
}

function BubbleContent({
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      data-slot="bubble-content"
      className={cn("ui-bubble-content", className)}
      {...props}
    />
  );
}

const bubbleReactionsVariants = cva("ui-bubble-reactions", {
  variants: {
    side: {
      top: "ui-bubble-reactions-top",
      bottom: "ui-bubble-reactions-bottom",
    },
    align: {
      start: "ui-bubble-reactions-start",
      end: "ui-bubble-reactions-end",
    },
  },
  defaultVariants: {
    side: "bottom",
    align: "end",
  },
});

function BubbleReactions({
  side = "bottom",
  align = "end",
  className,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof bubbleReactionsVariants>) {
  return (
    <div
      data-slot="bubble-reactions"
      data-align={align}
      data-side={side}
      className={cn(bubbleReactionsVariants({ side, align, className }))}
      {...props}
    />
  );
}

export {
  BubbleGroup,
  Bubble,
  BubbleContent,
  BubbleReactions,
  bubbleVariants,
};

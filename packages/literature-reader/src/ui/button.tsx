import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

/**
 * 按钮：一个页面只保留一个实心主按钮。
 * 高度 40 / 32 / 44，圆角 8，投影克制（e1），主色只用于主要动作。
 */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-transparent text-sm font-semibold leading-none transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/16 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(20,26,45,0.10)] hover:bg-brand-700 hover:shadow-[0_6px_16px_-8px_rgba(20,26,45,0.18)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_2px_rgba(20,26,45,0.10)] hover:bg-danger-700 hover:shadow-[0_6px_16px_-8px_rgba(20,26,45,0.18)]",
        outline:
          "border-border bg-white text-foreground shadow-[0_1px_2px_rgba(20,26,45,0.04)] hover:border-primary/32 hover:bg-accent hover:text-primary",
        secondary:
          "border-border bg-surface-2 text-foreground hover:border-primary/24 hover:bg-accent hover:text-primary",
        ghost: "text-foreground-soft hover:bg-ink-100 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        soft: "border-primary/14 bg-accent text-primary hover:bg-primary/12",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

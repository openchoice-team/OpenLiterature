import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

/**
 * 徽标：颜色 + 文字成对出现，不靠颜色单独表意。
 * 一律使用浅色底 + 深色字，保证在白卡与浅灰底上都清晰。
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold leading-5 transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/16",
  {
    variants: {
      variant: {
        default: "border-brand-200 bg-brand-50 text-brand-700",
        secondary: "border-border bg-surface-2 text-foreground-soft",
        outline: "border-border bg-white text-foreground-soft",
        success: "border-success-200 bg-success-50 text-success-700",
        warning: "border-warning-200 bg-warning-50 text-warning-700",
        danger: "border-danger-200 bg-danger-50 text-danger-700",
        info: "border-info-200 bg-info-50 text-info-700",
        ai: "border-ai-200 bg-ai-50 text-ai-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

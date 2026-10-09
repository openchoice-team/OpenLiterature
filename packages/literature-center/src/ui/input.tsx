import * as React from "react";

import { cn } from "../lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-white px-3.5 py-2 text-sm text-foreground shadow-[0_1px_2px_rgba(20,26,45,0.03)] transition-[border-color,box-shadow,background-color] duration-150 ease-brand file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-foreground-muted/80 hover:border-primary/32 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/16 disabled:cursor-not-allowed disabled:bg-muted/65 disabled:text-muted-foreground disabled:opacity-70 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-[3px] aria-[invalid=true]:ring-destructive/14",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };

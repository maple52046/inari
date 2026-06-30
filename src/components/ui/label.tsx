import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Form label styled with theme variables. */
export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-foreground mb-1.5 block text-sm font-medium",
        className,
      )}
      {...props}
    />
  );
}

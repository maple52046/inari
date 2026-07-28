import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Surface container using the card color tokens. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-border bg-card text-card-foreground rounded-lg border",
        className,
      )}
      {...props}
    />
  );
}

/** Padded title area for a card; pair with {@link CardContent}. */
export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

/**
 * Body of a card that already has a {@link CardHeader}.
 *
 * Drops its own top padding so the header supplies that gap. A card without a
 * header must therefore pad the {@link Card} itself instead of using this, since
 * `cn` only concatenates classes and cannot resolve the `pt-0` conflict.
 */
export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

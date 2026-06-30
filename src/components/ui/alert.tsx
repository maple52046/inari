import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type AlertVariant = "error" | "warning" | "info";

const VARIANTS: Record<AlertVariant, string> = {
  error: "border-destructive/40 bg-destructive/10 text-destructive",
  warning: "border-border bg-muted text-foreground",
  info: "border-border bg-accent text-accent-foreground",
};

/** Inline message banner for errors, warnings, and notices. */
export function Alert({
  variant = "info",
  children,
  className,
}: {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

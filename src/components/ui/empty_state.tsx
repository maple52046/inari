import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Centered placeholder for empty/zero-result views. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
      <Icon className="text-muted-foreground h-8 w-8" />
      <div>
        <p className="text-foreground font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

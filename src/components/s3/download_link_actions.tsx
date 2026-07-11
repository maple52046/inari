"use client";

import { Clock, Copy, ExternalLink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { useDownloadLinks } from "./download_link_context";

function expiryLabel(expiresAt: number | undefined): string {
  if (expiresAt === undefined) {
    return "";
  }
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    return "expired";
  }
  const minutes = Math.round(remainingMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m left`;
  }
  return `${Math.round(minutes / 60)}h left`;
}

/**
 * Compact Copy/Open actions for a single object's download link.
 *
 * Shows a truncated URL and, in presigned mode, loading/expiry/error state
 * without letting long URLs affect the surrounding layout.
 */
export function DownloadLinkActions({
  objectKey,
  showUrl = true,
}: {
  objectKey: string;
  showUrl?: boolean;
}) {
  const { linkFor, copy, open } = useDownloadLinks();
  const link = linkFor(objectKey);
  const disabled = link.status !== "ready";

  return (
    <div className="flex min-w-0 items-center gap-1">
      {showUrl ? (
        <span
          className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs"
          title={link.url ?? undefined}
        >
          {link.status === "loading"
            ? "Generating…"
            : link.status === "error"
              ? "Link unavailable"
              : (link.url ?? "")}
        </span>
      ) : null}

      {link.mode === "presigned" && link.status === "ready" ? (
        <span
          className={cn(
            "text-muted-foreground flex items-center gap-0.5 text-xs whitespace-nowrap",
          )}
          title="Presigned URL expiry"
        >
          <Clock className="h-3 w-3" />
          {expiryLabel(link.expiresAt)}
        </span>
      ) : null}

      {link.status === "loading" ? (
        <Spinner className="text-muted-foreground" />
      ) : null}
      {link.status === "error" ? (
        <TriangleAlert className="text-destructive h-4 w-4" />
      ) : null}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => copy(objectKey)}
        disabled={disabled}
        aria-label="Copy download link"
        title="Copy link"
      >
        <Copy className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => open(objectKey)}
        disabled={disabled}
        aria-label="Open download link"
        title="Open link"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>
    </div>
  );
}

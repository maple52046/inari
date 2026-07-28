import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { CopyButton } from "@/components/ui/copy_button";

interface Crumb {
  label: string;
  href: string;
}

function buildCrumbs(bucket: string, prefix: string): Crumb[] {
  const base = `/buckets/${encodeURIComponent(bucket)}`;
  const crumbs: Crumb[] = [{ label: bucket, href: base }];
  const segments = prefix.split("/").filter((segment) => segment.length > 0);
  let accumulated = "";
  for (const segment of segments) {
    accumulated += `${segment}/`;
    crumbs.push({
      label: segment,
      href: `${base}?prefix=${encodeURIComponent(accumulated)}`,
    });
  }
  return crumbs;
}

/**
 * Prefix breadcrumb trail; each crumb navigates via the `prefix` query, and a
 * trailing button copies the current location as an `s3://` URI.
 */
export function ObjectBreadcrumbs({
  bucket,
  prefix,
}: {
  bucket: string;
  prefix: string;
}) {
  const crumbs = buildCrumbs(bucket, prefix);
  // Kept unencoded and trailing-slash terminated: this value is meant to be
  // pasted into a chat or an `aws s3` command, not into a URL.
  const s3Uri = `s3://${bucket}/${prefix}`;
  return (
    <nav className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
      <Home className="h-4 w-4" />
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="h-3.5 w-3.5" /> : null}
            {isLast ? (
              <span className="text-foreground font-medium">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
      <CopyButton
        value={s3Uri}
        label=""
        size="icon"
        aria-label={`Copy path ${s3Uri}`}
        title="Copy path"
      />
    </nav>
  );
}

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

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

/** Prefix breadcrumb trail; each crumb navigates via the `prefix` query. */
export function ObjectBreadcrumbs({
  bucket,
  prefix,
}: {
  bucket: string;
  prefix: string;
}) {
  const crumbs = buildCrumbs(bucket, prefix);
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
    </nav>
  );
}

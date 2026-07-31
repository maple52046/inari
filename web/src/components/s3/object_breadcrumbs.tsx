import { Fragment } from "react";
import { Link } from "react-router";
import { ChevronRight, Home } from "lucide-react";
import { Breadcrumb, Icon, IconButton, Wrap } from "@chakra-ui/react";
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
 * Prefix breadcrumb trail; each crumb navigates via the `prefix` query, the
 * leading home button returns to the bucket list, and a trailing button copies
 * the current location as an `s3://` URI.
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
    <Wrap align="center" gap="1">
      <IconButton
        asChild
        variant="ghost"
        size="sm"
        aria-label="Go to bucket list"
        title="All buckets"
      >
        <Link to="/buckets">
          <Icon size="sm" asChild>
            <Home />
          </Icon>
        </Link>
      </IconButton>
      <Breadcrumb.Root size="sm">
        <Breadcrumb.List>
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            // Item and Separator both render an <li>, so the separator has to be
            // the Item's sibling. Nesting it inside the Item makes the browser
            // auto-close the outer <li> and hydration then mismatches.
            return (
              <Fragment key={crumb.href}>
                {index > 0 ? (
                  <Breadcrumb.Separator>
                    <Icon size="xs" asChild>
                      <ChevronRight />
                    </Icon>
                  </Breadcrumb.Separator>
                ) : null}
                <Breadcrumb.Item>
                  {isLast ? (
                    <Breadcrumb.CurrentLink fontWeight="medium">
                      {crumb.label}
                    </Breadcrumb.CurrentLink>
                  ) : (
                    <Breadcrumb.Link asChild>
                      <Link to={crumb.href}>{crumb.label}</Link>
                    </Breadcrumb.Link>
                  )}
                </Breadcrumb.Item>
              </Fragment>
            );
          })}
        </Breadcrumb.List>
      </Breadcrumb.Root>
      <CopyButton
        value={s3Uri}
        label=""
        size="icon"
        aria-label={`Copy path ${s3Uri}`}
        title="Copy path"
      />
    </Wrap>
  );
}

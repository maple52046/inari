"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, HardDrive, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "@/components/theme/theme_toggle";

const NAV_ITEMS = [
  { href: "/buckets", label: "Buckets", icon: Database },
  { href: "/cleanup", label: "Cleanup", icon: Sparkles },
  { href: "/admin/usage", label: "Usage", icon: HardDrive },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** Global top navigation shown on connected pages. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <header className="border-border bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <Link href="/buckets" className="flex items-center gap-2">
          <Database className="text-primary h-5 w-5" />
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="font-semibold">Inari</span>
            <span className="text-muted-foreground text-xs">
              Manage S3-compatible object storage.
            </span>
          </span>
        </Link>
        <nav className="ml-4 flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors sm:px-3",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

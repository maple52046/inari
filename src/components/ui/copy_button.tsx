"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "./button";
import type { ButtonProps } from "./button";

/** Copies the given text to the clipboard and briefly confirms. */
export function CopyButton({
  value,
  label = "Copy",
  ...props
}: { value: string; label?: string } & Omit<ButtonProps, "onClick">) {
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (e.g. insecure context); ignore so the
      // UI does not crash on a best-effort convenience action.
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={copy} {...props}>
      {copied ? (
        <Check className="text-primary h-4 w-4" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}

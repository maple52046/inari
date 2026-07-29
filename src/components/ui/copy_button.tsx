"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Icon } from "@chakra-ui/react";
import { Button } from "./button";
import type { ButtonProps } from "./button";
import { useToast } from "./toast";
import { copyText } from "@/lib/clipboard";

/** Copies the given text to the clipboard and confirms via icon and toast. */
export function CopyButton({
  value,
  label = "Copy",
  ...props
}: { value: string; label?: string } & Omit<ButtonProps, "onClick">) {
  const [copied, setCopied] = useState(false);
  const { notify } = useToast();

  async function copy(): Promise<void> {
    const ok = await copyText(value);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      notify("Copied to clipboard");
    } else {
      notify("Copy failed", "error");
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={copy} {...props}>
      <Icon size="sm" color={copied ? "brand.solid" : undefined} asChild>
        {copied ? <Check /> : <Copy />}
      </Icon>
      {label}
    </Button>
  );
}

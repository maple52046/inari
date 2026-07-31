"use client";

import { Check, Copy } from "lucide-react";
import { Icon } from "@chakra-ui/react";
import { Button } from "./button";
import type { ButtonProps } from "./button";
import { useToast } from "./toast";
import { useCopiedFlag } from "./use_copied_flag";
import { copyText } from "@/lib/clipboard";

/** Copies the given text to the clipboard and confirms via icon and toast. */
export function CopyButton({
  value,
  label = "Copy",
  ...props
}: { value: string; label?: string } & Omit<ButtonProps, "onClick">) {
  const { copied, acknowledgeCopy } = useCopiedFlag();
  const { notify } = useToast();

  async function copy(): Promise<void> {
    const ok = await copyText(value);
    if (ok) {
      acknowledgeCopy();
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

"use client";

import { Switch as ChakraSwitch } from "@chakra-ui/react";

/** Accessible on/off toggle. */
export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <ChakraSwitch.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(event) => onCheckedChange(event.checked)}
      size="md"
    >
      <ChakraSwitch.HiddenInput aria-label={ariaLabel} />
      <ChakraSwitch.Control>
        <ChakraSwitch.Thumb />
      </ChakraSwitch.Control>
    </ChakraSwitch.Root>
  );
}

import type { ReactNode } from "react";
import { Alert as ChakraAlert } from "@chakra-ui/react";

type AlertVariant = "error" | "warning" | "info";

/** Inline message banner for errors, warnings, and notices. */
export function Alert({
  variant = "info",
  children,
}: {
  variant?: AlertVariant;
  children: ReactNode;
}) {
  return (
    <ChakraAlert.Root status={variant} variant="subtle" alignItems="flex-start">
      <ChakraAlert.Indicator />
      <ChakraAlert.Content>{children}</ChakraAlert.Content>
    </ChakraAlert.Root>
  );
}

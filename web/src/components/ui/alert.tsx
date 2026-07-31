import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Alert as ChakraAlert } from "@chakra-ui/react";

type AlertVariant = "error" | "warning" | "info";

const WARNING_STYLES = {
  bg: "transparent",
  color: "notice.fg",
  borderWidth: "1px",
  borderColor: "notice.fg",
} as const;

/** Inline message banner for errors, warnings, and notices. */
export function Alert({
  variant = "info",
  children,
}: {
  variant?: AlertVariant;
  children: ReactNode;
}) {
  // Warnings are an unfilled amber outline with the lucide triangle, rather than
  // the palette's orange status colours and Chakra's built-in glyph. The
  // `subtle` recipe only colours the root, so the indicator and the content
  // inherit this colour instead of needing their own.
  const isWarning = variant === "warning";
  return (
    <ChakraAlert.Root
      status={variant}
      variant="subtle"
      alignItems="flex-start"
      {...(isWarning ? WARNING_STYLES : {})}
    >
      <ChakraAlert.Indicator>
        {isWarning ? <TriangleAlert /> : undefined}
      </ChakraAlert.Indicator>
      <ChakraAlert.Content>{children}</ChakraAlert.Content>
    </ChakraAlert.Root>
  );
}

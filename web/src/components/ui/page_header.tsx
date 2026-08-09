import type { ReactNode } from "react";
import { Heading, Stack, Text } from "@chakra-ui/react";

/**
 * Title block shared by every page.
 *
 * Exists so the heading level, display face and spacing are decided once;
 * previously each page hand-rolled its own heading and they had drifted apart.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Stack
      direction={{ base: "column", sm: "row" }}
      justify="space-between"
      align={{ base: "stretch", sm: "center" }}
      gap="3"
    >
      {/* Claims the row rather than sitting at its natural width, so a
          description can align something against the far edge of the page. */}
      <Stack gap="1" flex="1" minW="0">
        <Heading
          as="h1"
          fontFamily="heading"
          fontWeight="700"
          fontSize="2xl"
          letterSpacing="tight"
        >
          {title}
        </Heading>
        {description ? (
          // A div, not the default paragraph: a description may be a laid-out
          // node, and a <p> cannot legally contain one.
          <Text as="div" color="fg.muted" fontSize="sm">
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions}
    </Stack>
  );
}

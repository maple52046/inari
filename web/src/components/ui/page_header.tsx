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
      <Stack gap="1">
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
          <Text color="fg.muted" fontSize="sm">
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions}
    </Stack>
  );
}

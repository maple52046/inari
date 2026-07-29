import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  EmptyState as ChakraEmptyState,
  Icon,
  Stack,
  VStack,
} from "@chakra-ui/react";

/** Centered placeholder for empty/zero-result views. */
export function EmptyState({
  icon: LeadingIcon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <ChakraEmptyState.Root
      borderWidth="1px"
      borderStyle="dashed"
      borderColor="border"
      borderRadius="l3"
    >
      <ChakraEmptyState.Content>
        <ChakraEmptyState.Indicator>
          <Icon size="xl" asChild>
            <LeadingIcon />
          </Icon>
        </ChakraEmptyState.Indicator>
        <VStack textAlign="center" gap="1">
          <ChakraEmptyState.Title>{title}</ChakraEmptyState.Title>
          {description ? (
            <ChakraEmptyState.Description>
              {description}
            </ChakraEmptyState.Description>
          ) : null}
        </VStack>
        {action ? <Stack>{action}</Stack> : null}
      </ChakraEmptyState.Content>
    </ChakraEmptyState.Root>
  );
}

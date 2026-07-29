import { Card as ChakraCard } from "@chakra-ui/react";
import type { CardRootProps } from "@chakra-ui/react";

/**
 * Surface container.
 *
 * Defaults to the elevated variant: before the Chakra migration every surface
 * was a flat bordered box, which left pages with no visual hierarchy.
 */
export function Card(props: CardRootProps) {
  return <ChakraCard.Root variant="elevated" {...props} />;
}

/** Padded title area for a card; pair with {@link CardContent}. */
export const CardHeader = ChakraCard.Header;

/** Body of a card. */
export const CardContent = ChakraCard.Body;

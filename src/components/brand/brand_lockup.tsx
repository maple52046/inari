import { Icon, Stack, Text } from "@chakra-ui/react";
import { InariMark } from "./inari_mark";

interface BrandLockupProps {
  /** Renders the product tagline beneath the wordmark. */
  withTagline?: boolean;
  /** `lg` is intended for the unauthenticated connect screen. */
  size?: "sm" | "lg";
}

/** The mark paired with the wordmark, set in the display face. */
export function BrandLockup({
  withTagline = false,
  size = "sm",
}: BrandLockupProps) {
  const large = size === "lg";
  return (
    <Stack direction="row" align="center" gap={large ? "3" : "2.5"}>
      <Icon size={large ? "lg" : "md"} color="brand.solid" asChild>
        <InariMark />
      </Icon>
      {/* The wordmark is dropped on the narrowest screens so the mark alone
          carries the brand and the nav items keep their room. */}
      <Stack
        gap="0"
        lineHeight="tight"
        display={large ? "flex" : { base: "none", sm: "flex" }}
      >
        <Text
          fontFamily="heading"
          fontWeight="700"
          fontSize={large ? "2xl" : "md"}
          letterSpacing="tight"
        >
          Inari
        </Text>
        {withTagline ? (
          <Text color="fg.muted" fontSize={large ? "sm" : "xs"}>
            Manage S3-compatible object storage.
          </Text>
        ) : null}
      </Stack>
    </Stack>
  );
}

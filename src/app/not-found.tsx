import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import {
  Container,
  Heading,
  HStack,
  Icon,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Not found - Inari",
};

/**
 * Page shown for an unmatched route.
 *
 * Lives at the app root, so it renders inside the root layout without the
 * connected shell: a wrong URL should not depend on being signed in.
 */
export default function NotFound() {
  return (
    <Container as="main" maxW="md" px="4" py="10" minH="100vh">
      <Stack
        justify="center"
        align="center"
        minH="80vh"
        gap="5"
        textAlign="center"
      >
        <HStack
          align="center"
          justify="center"
          boxSize="12"
          borderRadius="l3"
          bg="brand.muted"
        >
          <Icon size="lg" color="brand.solid" asChild>
            <FileQuestion />
          </Icon>
        </HStack>

        <Stack gap="2">
          <Heading
            as="h1"
            fontFamily="heading"
            fontWeight="700"
            fontSize="2xl"
            letterSpacing="tight"
          >
            Page not found
          </Heading>
          <Text color="fg.muted" fontSize="sm">
            That address does not match anything here. It may have moved, or the
            link may be out of date.
          </Text>
        </Stack>

        {/* Targets `/` rather than a concrete page: the root redirects to the
            bucket list when a session exists and to the connect screen when it
            does not, so this lands correctly either way. */}
        <Button asChild>
          <Link href="/">
            <Icon size="sm" asChild>
              <Home />
            </Icon>
            Back to home
          </Link>
        </Button>
      </Stack>
    </Container>
  );
}

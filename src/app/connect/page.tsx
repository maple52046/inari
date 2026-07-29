import { ShieldCheck } from "lucide-react";
import {
  Box,
  Container,
  Heading,
  HStack,
  Icon,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BrandLockup } from "@/components/brand/brand_lockup";
import { ConnectForm } from "@/components/s3/connect_form";
import { getDefaultEndpoint } from "@/infrastructure/config";

export const metadata = {
  title: "Connect - Inari",
};

export default function ConnectPage() {
  const defaultEndpoint = getDefaultEndpoint();
  return (
    <Container as="main" maxW="lg" px="4" py="10" minH="100vh">
      <Stack justify="center" minH="80vh" gap="6">
        <BrandLockup size="lg" withTagline />
        <Card>
          <CardHeader>
            <Heading as="h2" size="lg" fontFamily="heading" fontWeight="700">
              Connect to storage
            </Heading>
            <Text color="fg.muted" fontSize="sm" mt="1">
              Enter your S3-compatible endpoint and credentials. Credentials are
              sealed in an http-only cookie that only the server can decrypt,
              and are never readable by scripts in your browser.
            </Text>
          </CardHeader>
          <CardContent>
            <ConnectForm defaultEndpoint={defaultEndpoint} />
          </CardContent>
        </Card>
        <HStack color="fg.muted" fontSize="xs" justify="center" gap="1.5">
          <Icon size="xs" asChild>
            <ShieldCheck />
          </Icon>
          <Box as="span">
            Secrets stay unreadable to the browser and are never written to
            localStorage.
          </Box>
        </HStack>
      </Stack>
    </Container>
  );
}

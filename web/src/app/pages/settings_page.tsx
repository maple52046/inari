import type { ReactNode } from "react";
import { Info, Plug, Puzzle } from "lucide-react";
import {
  Flex,
  Heading,
  HStack,
  Icon,
  Link,
  Span,
  Stack,
  StackSeparator,
  Text,
} from "@chakra-ui/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page_header";
import { BrandLockup } from "@/components/brand/brand_lockup";
import { ColorModeSelector } from "@/components/theme/color_mode";
import { DisconnectButton } from "@/components/s3/disconnect_button";
import { formatDateTime } from "@/lib/date";
import { SOURCE_URL } from "@/lib/product";
import { useDocumentTitle } from "@/lib/use_document_title";
import { useSession } from "../session_context";

/**
 * Provider plugins the build ships.
 *
 * The seam exists so vendor-specific admin features can be added later; nothing
 * configures one yet, which is what the screen reports. Static here because the
 * set is decided at build time, not by the connection.
 */
const PROVIDER_PLUGINS = [
  { id: "minio", label: "MinIO", configured: false },
] as const;

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Flex justify="space-between" gap="4" py="1.5" fontSize="sm">
      <Span color="fg.muted">{label}</Span>
      <Span textAlign="right" wordBreak="break-all">
        {value}
      </Span>
    </Flex>
  );
}

function SectionHeading({
  icon: LeadingIcon,
  children,
}: {
  icon: typeof Plug;
  children: string;
}) {
  return (
    <HStack gap="2">
      <Icon size="md" color="brand.solid" asChild>
        <LeadingIcon />
      </Icon>
      <Heading as="h2" size="md" fontFamily="heading" fontWeight="700">
        {children}
      </Heading>
    </HStack>
  );
}

export function SettingsPage() {
  useDocumentTitle("Settings");
  const { session } = useSession();

  if (!session?.connected) {
    return null;
  }

  return (
    <Stack gap="5">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader>
          <Heading as="h2" size="md" fontFamily="heading" fontWeight="700">
            Appearance
          </Heading>
          <Text color="fg.muted" fontSize="sm" mt="1">
            Choose your theme. The product defaults to dark.
          </Text>
        </CardHeader>
        <CardContent>
          <ColorModeSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeading icon={Plug}>Connection</SectionHeading>
        </CardHeader>
        <CardContent>
          <Stack gap="0" separator={<StackSeparator />}>
            <InfoRow label="Endpoint" value={session.endpoint} />
            <InfoRow
              label="Access Key ID"
              value={session.accessKeyIdMasked}
            />
            <InfoRow label="Region" value={session.region} />
            <InfoRow
              label="Force Path Style"
              value={session.forcePathStyle ? "Yes" : "No"}
            />
            <InfoRow
              label="TLS Verification"
              value={
                session.skipTlsVerification ? "Skipped (insecure)" : "Enabled"
              }
            />
            <InfoRow
              label="Connected since"
              value={
                session.createdAt
                  ? formatDateTime(new Date(session.createdAt))
                  : "-"
              }
            />
            <InfoRow
              label="Last used"
              value={
                session.lastUsedAt
                  ? formatDateTime(new Date(session.lastUsedAt))
                  : "-"
              }
            />
          </Stack>
          <Text color="fg.muted" fontSize="xs" mt="3">
            The session is stored in an encrypted, http-only cookie. The secret
            is never readable by scripts in your browser.
          </Text>
          <Stack mt="4" align="flex-start">
            <DisconnectButton />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeading icon={Puzzle}>Provider Plugins</SectionHeading>
        </CardHeader>
        <CardContent>
          <Stack gap="2">
            {PROVIDER_PLUGINS.map((plugin) => (
              <Flex
                key={plugin.id}
                borderWidth="1px"
                borderColor="border"
                borderRadius="l2"
                px="3"
                py="2"
                fontSize="sm"
                align="center"
                justify="space-between"
              >
                <Span fontWeight="medium">{plugin.label}</Span>
                <Span color="fg.muted">
                  {plugin.configured
                    ? "Configured"
                    : `${plugin.label} plugin not configured`}
                </Span>
              </Flex>
            ))}
            <Text color="fg.muted" fontSize="xs">
              Provider plugins add vendor-specific admin features. Standard
              features work without any plugin configured.
            </Text>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeading icon={Info}>About</SectionHeading>
        </CardHeader>
        <CardContent>
          <Stack gap="4">
            <BrandLockup withTagline />
            <Stack gap="0" separator={<StackSeparator />}>
              <InfoRow
                label="Source code"
                value={
                  <Link
                    href={SOURCE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    color="brand.solid"
                  >
                    {SOURCE_URL.replace("https://", "")}
                  </Link>
                }
              />
              <InfoRow label="Licence" value="MIT" />
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

import { redirect } from "next/navigation";
import { Plug, Puzzle } from "lucide-react";
import {
  Flex,
  Heading,
  HStack,
  Icon,
  Span,
  Stack,
  StackSeparator,
  Text,
} from "@chakra-ui/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page_header";
import { ColorModeSelector } from "@/components/theme/color_mode";
import { DisconnectButton } from "@/components/s3/disconnect_button";
import {
  createSessionStore,
  getProviderPlugins,
} from "@/infrastructure/composition";
import { formatDateTime } from "@/lib/date";

export const metadata = {
  title: "Settings - Inari",
};

/** Masks all but the leading characters of an access key. */
function maskKeyId(value: string): string {
  if (value.length <= 4) {
    return "••••";
  }
  return `${value.slice(0, 4)}${"•".repeat(Math.min(value.length - 4, 12))}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
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

export default async function SettingsPage() {
  const session = await createSessionStore().getSession();
  if (!session) {
    redirect("/connect");
  }
  const plugins = getProviderPlugins();
  const { connection, createdAt, lastUsedAt } = session;

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
            <InfoRow label="Endpoint" value={connection.endpoint} />
            <InfoRow
              label="Access Key ID"
              value={maskKeyId(connection.accessKeyId)}
            />
            <InfoRow label="Region" value={connection.region} />
            <InfoRow
              label="Force Path Style"
              value={connection.forcePathStyle ? "Yes" : "No"}
            />
            <InfoRow
              label="TLS Verification"
              value={
                connection.skipTlsVerification
                  ? "Skipped (insecure)"
                  : "Enabled"
              }
            />
            <InfoRow
              label="Connected since"
              value={formatDateTime(createdAt)}
            />
            <InfoRow label="Last used" value={formatDateTime(lastUsedAt)} />
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
            {plugins.map((plugin) => (
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
                  {plugin.isConfigured()
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
    </Stack>
  );
}

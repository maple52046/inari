import { redirect } from "next/navigation";
import { Plug, Puzzle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThemeSelector } from "@/components/theme/theme_selector";
import { DisconnectButton } from "@/components/s3/disconnect_button";
import {
  createSessionStore,
  getProviderPlugins,
} from "@/infrastructure/composition";
import { formatDateTime } from "@/lib/date";

export const metadata = {
  title: "Settings - S3 Manager",
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
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
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
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Appearance</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose your theme. The product defaults to dark.
          </p>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <Plug className="text-primary h-5 w-5" />
          <h2 className="font-semibold">Connection</h2>
        </CardHeader>
        <CardContent>
          <div className="divide-border divide-y">
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
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            The session is stored in an encrypted, http-only cookie and expires
            with your browser session. The secret is never sent to the browser.
          </p>
          <div className="mt-4">
            <DisconnectButton />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center gap-2">
          <Puzzle className="text-primary h-5 w-5" />
          <h2 className="font-semibold">Provider Plugins</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {plugins.map((plugin) => (
            <div
              key={plugin.id}
              className="border-border flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <span className="font-medium">{plugin.label}</span>
              <span className="text-muted-foreground">
                {plugin.isConfigured()
                  ? "Configured"
                  : `${plugin.label} plugin not configured`}
              </span>
            </div>
          ))}
          <p className="text-muted-foreground text-xs">
            Provider plugins add vendor-specific admin features. Standard
            features work without any plugin configured.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

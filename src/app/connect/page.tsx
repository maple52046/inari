import { Database, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConnectForm } from "@/components/s3/connect_form";
import { getDefaultEndpoint } from "@/infrastructure/config";

export const metadata = {
  title: "Connect - S3 Manager",
};

export default function ConnectPage() {
  const defaultEndpoint = getDefaultEndpoint();
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Database className="text-primary h-6 w-6" />
        <div className="leading-tight">
          <h1 className="text-xl font-semibold">Inari</h1>
          <p className="text-muted-foreground text-sm">
            Manage S3-compatible object storage.
          </p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Connect to storage</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Enter your S3-compatible endpoint and credentials. Credentials are
            kept on the server in an encrypted session and never stored in your
            browser.
          </p>
        </CardHeader>
        <CardContent>
          <ConnectForm defaultEndpoint={defaultEndpoint} />
        </CardContent>
      </Card>
      <p className="text-muted-foreground mt-4 flex items-center justify-center gap-1.5 text-xs">
        <ShieldCheck className="h-3.5 w-3.5" />
        Secrets stay server-side and are never written to localStorage.
      </p>
    </main>
  );
}

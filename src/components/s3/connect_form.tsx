"use client";

import { useState } from "react";
import { useActionState } from "react";
import { ChevronDown, Plug, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { connectAction, testConnectionAction } from "@/app/connect/actions";
import { INITIAL_CONNECT_STATE } from "@/app/connect/connect_state";

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return <p className="text-destructive mt-1 text-xs">{message}</p>;
}

/** Connection setup form; submits to server actions, no client-side S3 calls. */
export function ConnectForm({ defaultEndpoint }: { defaultEndpoint: string }) {
  const [connectState, connectFormAction, connecting] = useActionState(
    connectAction,
    INITIAL_CONNECT_STATE,
  );
  const [testState, testFormAction, testing] = useActionState(
    testConnectionAction,
    INITIAL_CONNECT_STATE,
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fieldErrors = {
    ...testState.fieldErrors,
    ...connectState.fieldErrors,
  };
  const errorMessage =
    connectState.status === "error" && connectState.message
      ? connectState.message
      : testState.status === "error" && testState.message
        ? testState.message
        : undefined;

  return (
    <form action={connectFormAction} className="space-y-4">
      <div>
        <Label htmlFor="endpoint">S3 Endpoint</Label>
        <Input
          id="endpoint"
          name="endpoint"
          type="url"
          autoComplete="off"
          defaultValue={defaultEndpoint}
          placeholder="https://s3.example.com"
        />
        <FieldError message={fieldErrors.endpoint} />
      </div>

      <div>
        <Label htmlFor="accessKeyId">Access Key ID</Label>
        <Input
          id="accessKeyId"
          name="accessKeyId"
          autoComplete="off"
          placeholder="AKIA…"
        />
        <FieldError message={fieldErrors.accessKeyId} />
      </div>

      <div>
        <Label htmlFor="secretAccessKey">Secret Access Key</Label>
        <Input
          id="secretAccessKey"
          name="secretAccessKey"
          type="password"
          autoComplete="off"
          placeholder="••••••••••••"
        />
        <FieldError message={fieldErrors.secretAccessKey} />
      </div>

      <div className="border-border rounded-md border">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 py-2 text-sm"
        >
          <span>Advanced settings</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              advancedOpen && "rotate-180",
            )}
          />
        </button>
        {/* Always mounted so form values are submitted even when collapsed;
            otherwise an unopened section would drop forcePathStyle (defaulting
            it to false and breaking path-style addressing). */}
        <div
          className={cn(
            "border-border space-y-4 border-t p-3",
            !advancedOpen && "hidden",
          )}
        >
          <div>
            <Label htmlFor="region">Region</Label>
            <Input id="region" name="region" defaultValue="us-east-1" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="forcePathStyle"
              defaultChecked
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Force Path Style (recommended for self-hosted backends)
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="skipTlsVerification"
              className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>
              Skip TLS verification
              <span className="text-muted-foreground block text-xs">
                Insecure. Only for self-signed or internal-CA certificates.
              </span>
            </span>
          </label>
        </div>
      </div>
      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}
      {testState.status === "success" && testState.message ? (
        <Alert variant="info">{testState.message}</Alert>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={connecting || testing}>
          {connecting ? <Spinner /> : <Plug className="h-4 w-4" />}
          Connect
        </Button>
        <Button
          type="submit"
          variant="outline"
          formAction={testFormAction}
          disabled={connecting || testing}
        >
          {testing ? <Spinner /> : <Wifi className="h-4 w-4" />}
          Test Connection
        </Button>
      </div>
    </form>
  );
}

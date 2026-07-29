"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { Icon } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { disconnectAction } from "@/app/(app)/settings/actions";

/** Clears the session after a confirmation prompt. */
export function DisconnectButton() {
  const [pending, startTransition] = useTransition();

  function disconnect(): void {
    if (!window.confirm("Disconnect and clear the current session?")) {
      return;
    }
    startTransition(() => {
      void disconnectAction();
    });
  }

  return (
    <Button variant="destructive" onClick={disconnect} disabled={pending}>
      {pending ? (
        <Spinner size="sm" />
      ) : (
        <Icon size="sm" asChild>
          <LogOut />
        </Icon>
      )}
      Disconnect
    </Button>
  );
}

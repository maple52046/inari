"use client";

import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";
import { Icon, Text } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { disconnectAction } from "@/api/actions";

/**
 * Clears the session after a confirmation.
 *
 * The confirmation is a dialog rather than `window.confirm`, which the browser
 * draws itself: it ignores the colour mode, sits wherever the browser puts it
 * rather than over the app, and cannot say what disconnecting actually costs.
 */
export function DisconnectButton() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function disconnect(): void {
    setConfirming(false);
    startTransition(() => {
      void disconnectAction();
    });
  }

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setConfirming(true)}
        disabled={pending}
      >
        {pending ? (
          <Spinner size="sm" />
        ) : (
          <Icon size="sm" asChild>
            <LogOut />
          </Icon>
        )}
        Disconnect
      </Button>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Disconnect"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={disconnect}>
              <Icon size="sm" asChild>
                <LogOut />
              </Icon>
              Disconnect
            </Button>
          </>
        }
      >
        <Text fontSize="sm">
          This clears the stored connection and returns you to the connect
          screen. Nothing in your storage is changed, and you can reconnect with
          the same credentials.
        </Text>
      </Modal>
    </>
  );
}

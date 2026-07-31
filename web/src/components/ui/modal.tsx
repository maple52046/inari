"use client";

import type { ReactNode } from "react";
import { CloseButton, Dialog, Portal } from "@chakra-ui/react";

/** Centered modal dialog; closes on Escape or backdrop click. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(event) => {
        if (!event.open) {
          onClose();
        }
      }}
      placement="center"
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW="lg">
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" aria-label="Close" />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body>{children}</Dialog.Body>
            {footer ? <Dialog.Footer>{footer}</Dialog.Footer> : null}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

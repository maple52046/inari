"use client";

import {
  createToaster,
  Portal,
  Toast,
  Toaster as ChakraToaster,
} from "@chakra-ui/react";

type ToastVariant = "success" | "error";

/** How long a toast stays visible, in milliseconds. */
const TOAST_TTL = 2500;

// A module singleton rather than React context: toasts are fire-and-forget and
// this lets non-component code enqueue them without a provider lookup.
const toaster = createToaster({
  placement: "bottom-end",
  pauseOnPageIdle: true,
  duration: TOAST_TTL,
});

/** Renders the toast region; mount once at the root. */
export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => (
          <Toast.Root width={{ md: "sm" }}>
            <Toast.Indicator />
            <Toast.Title>{toast.title}</Toast.Title>
            <Toast.CloseTrigger />
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}

interface ToastApi {
  /** Shows a transient toast; defaults to the success style. */
  notify: (message: string, variant?: ToastVariant) => void;
}

/** Accesses the toast API. */
export function useToast(): ToastApi {
  return {
    notify: (message, variant = "success") => {
      toaster.create({ title: message, type: variant });
    },
  };
}

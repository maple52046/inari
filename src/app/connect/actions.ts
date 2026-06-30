"use server";

import { redirect } from "next/navigation";
import { StorageError } from "@/domain/s3/errors";
import { storageErrorMessage } from "@/domain/s3/errors";
import {
  connectStorage,
  testStorageConnection,
} from "@/application/connect_storage";
import {
  createSessionStore,
  createStorage,
} from "@/infrastructure/composition";
import { readConnectionForm } from "./connection_schema";
import type { ConnectState } from "./connect_state";

function toMessage(error: unknown): string {
  if (error instanceof StorageError) {
    const base = storageErrorMessage(error.kind);
    // In development, append the underlying cause so the operator can diagnose
    // misconfiguration without digging through server logs. Never includes the
    // secret. Production keeps the generic, safe message.
    if (process.env.NODE_ENV === "development" && error.detail) {
      return `${base} — ${error.detail}`;
    }
    return base;
  }
  return "An unexpected error occurred";
}

/** Validates and connects, then redirects to the bucket list on success. */
export async function connectAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const parsed = readConnectionForm(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.fieldErrors };
  }
  try {
    await connectStorage(
      { createStorage, session: createSessionStore() },
      parsed.data,
    );
  } catch (error) {
    return { status: "error", message: toMessage(error) };
  }
  redirect("/buckets");
}

/** Validates the candidate connection without persisting it. */
export async function testConnectionAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const parsed = readConnectionForm(formData);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.fieldErrors };
  }
  try {
    await testStorageConnection(createStorage, parsed.data);
  } catch (error) {
    return { status: "error", message: toMessage(error) };
  }
  return { status: "success", message: "Connection succeeded" };
}

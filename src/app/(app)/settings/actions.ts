"use server";

import { redirect } from "next/navigation";
import { createSessionStore } from "@/infrastructure/composition";

/** Clears the connection session and returns to the connect page. */
export async function disconnectAction(): Promise<void> {
  await createSessionStore().clear();
  redirect("/connect");
}

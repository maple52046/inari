import { redirect } from "next/navigation";
import { createSessionStore } from "@/infrastructure/composition";

export default async function HomePage() {
  const connection = await createSessionStore().getConnection();
  redirect(connection ? "/buckets" : "/connect");
}

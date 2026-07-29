import { Box, Container } from "@chakra-ui/react";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/layout/top_nav";
import { createSessionStore } from "@/infrastructure/composition";

/**
 * Shell for connected pages.
 *
 * Guards the whole group: without an active session the user is sent to
 * `/connect`, so credential-bearing pages never render unauthenticated.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const connection = await createSessionStore().getConnection();
  if (!connection) {
    redirect("/connect");
  }
  return (
    <Box minH="100vh">
      <TopNav />
      <Container as="main" maxW="7xl" px="4" py="6">
        {children}
      </Container>
    </Box>
  );
}

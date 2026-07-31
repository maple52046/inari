import { Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { Box, Container } from "@chakra-ui/react";
import { TopNav } from "@/components/layout/top_nav";
import { useSession } from "./session_context";
import { PageSkeleton } from "./page_skeleton";
import { BucketsPage } from "./pages/buckets_page";
import { BucketPage } from "./pages/bucket_page";
import { CleanupPage } from "./pages/cleanup_page";
import { ConnectPage } from "./pages/connect_page";
import { NotFoundPage } from "./pages/not_found_page";
import { SettingsPage } from "./pages/settings_page";

/**
 * Shell for connected pages.
 *
 * Guards the whole group: without an active session the user is sent to
 * `/connect`, so credential-bearing pages never render unauthenticated. This
 * replaces the `(app)` route group's layout.
 */
function AppShell() {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return (
      <Box minH="100vh">
        <Container as="main" maxW="7xl" px="4" py="6">
          <PageSkeleton />
        </Container>
      </Box>
    );
  }

  if (!session?.connected) {
    // The attempted address rides along so connecting returns the user where
    // they were headed rather than always to the bucket list.
    return <Navigate to="/connect" replace state={{ from: location }} />;
  }

  return (
    <Box minH="100vh">
      <TopNav />
      <Container as="main" maxW="7xl" px="4" py="6">
        <Outlet />
      </Container>
    </Box>
  );
}

/** Sends the root at whichever screen the session state calls for. */
function RootRedirect() {
  const { session, loading } = useSession();
  if (loading) {
    return null;
  }
  return <Navigate to={session?.connected ? "/buckets" : "/connect"} replace />;
}

/** The application's route table. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/connect" element={<ConnectPage />} />
      <Route element={<AppShell />}>
        <Route path="/buckets" element={<BucketsPage />} />
        <Route path="/buckets/:bucket" element={<BucketPage />} />
        <Route path="/cleanup" element={<CleanupPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

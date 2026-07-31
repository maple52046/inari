import { createContext, useContext, useMemo, type ReactNode } from "react";
import { getSession } from "@/api/actions";
import type { SessionDto } from "@/api/types";
import { useResource } from "@/lib/use_resource";

interface SessionState {
  /** The current session, or undefined until the first read completes. */
  session: SessionDto | undefined;
  /** Whether the first read is still in flight. */
  loading: boolean;
  /** Re-reads the session, used after connecting or disconnecting. */
  refresh: () => void;
}

const SessionContext = createContext<SessionState | undefined>(undefined);

/**
 * Holds the session for the whole application.
 *
 * The Next.js version read the sealed cookie in a Server Component on every
 * navigation. A SPA cannot read an HttpOnly cookie, so the non-secret half of
 * the session is fetched once here and shared, rather than each page asking
 * again.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  // A failed read is indistinguishable from being logged out as far as routing
  // is concerned: either way the connect screen is where the user can act.
  const resource = useResource("session", getSession, "Not connected");

  const value = useMemo(
    () => ({
      session: resource.data,
      loading: resource.loading,
      refresh: resource.reload,
    }),
    [resource.data, resource.loading, resource.reload],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/**
 * Returns the shared session state.
 *
 * @throws Error when called outside {@link SessionProvider}, which would
 * otherwise surface as a confusing undefined further down.
 */
export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return value;
}

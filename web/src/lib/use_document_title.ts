import { useEffect } from "react";

/** Suffix every page title carries, matching the Next.js metadata. */
const SUFFIX = "Inari";

/**
 * Sets the document title for as long as a page is mounted.
 *
 * Replaces Next.js route `metadata`, which the framework applied per page.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} - ${SUFFIX}` : SUFFIX;
  }, [title]);
}

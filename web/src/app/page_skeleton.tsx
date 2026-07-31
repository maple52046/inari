import { Skeleton, SkeletonText, Stack } from "@chakra-ui/react";

/**
 * Route-level placeholder.
 *
 * Mirrors the common page shape (heading, sub-line, then a content block) so the
 * layout does not jump once the real content arrives. Carried over from the
 * Next.js `loading.tsx`, which the framework rendered during navigation; here
 * each page shows it while its own data is in flight.
 */
export function PageSkeleton() {
  return (
    <Stack gap="5">
      <Stack gap="2">
        <Skeleton height="8" width="12rem" />
        <Skeleton height="4" width="18rem" />
      </Stack>
      <Skeleton height="10" width="20rem" />
      <SkeletonText noOfLines={6} gap="4" />
    </Stack>
  );
}

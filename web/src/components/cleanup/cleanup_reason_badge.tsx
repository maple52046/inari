import { Badge } from "@chakra-ui/react";

/** Small pill describing why an object was ranked as a cleanup candidate. */
export function CleanupReasonBadge({ reason }: { reason: string }) {
  return (
    <Badge variant="subtle" size="sm" whiteSpace="nowrap">
      {reason}
    </Badge>
  );
}

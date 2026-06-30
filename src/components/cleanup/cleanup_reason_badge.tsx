/** Small pill describing why an object was ranked as a cleanup candidate. */
export function CleanupReasonBadge({ reason }: { reason: string }) {
  return (
    <span className="bg-accent text-accent-foreground inline-block rounded px-1.5 py-0.5 text-xs whitespace-nowrap">
      {reason}
    </span>
  );
}

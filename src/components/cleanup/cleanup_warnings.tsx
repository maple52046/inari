import type { CleanupWarning } from "@/domain/s3/cleanup";
import { Alert } from "@/components/ui/alert";

/** Shows buckets that could not be scanned without implying total failure. */
export function CleanupWarnings({ warnings }: { warnings: CleanupWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <Alert variant="warning">
      <p className="font-medium">Some buckets could not be scanned.</p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {warnings.map((warning) => (
          <li key={warning.bucket}>
            {warning.bucket}: {warning.message}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

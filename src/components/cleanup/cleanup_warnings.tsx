import { List, Stack, Text } from "@chakra-ui/react";
import type { CleanupWarning } from "@/domain/s3/cleanup";
import { Alert } from "@/components/ui/alert";

/** Shows buckets that could not be scanned without implying total failure. */
export function CleanupWarnings({ warnings }: { warnings: CleanupWarning[] }) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <Alert variant="warning">
      <Stack gap="1">
        <Text fontWeight="medium">Some buckets could not be scanned.</Text>
        <List.Root variant="plain" fontSize="xs" gap="0.5">
          {warnings.map((warning) => (
            <List.Item key={warning.bucket}>
              {warning.bucket}: {warning.message}
            </List.Item>
          ))}
        </List.Root>
      </Stack>
    </Alert>
  );
}

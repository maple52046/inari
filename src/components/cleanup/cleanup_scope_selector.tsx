"use client";

import { NativeSelect, SimpleGrid, Text } from "@chakra-ui/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Chooses the scan scope: all buckets or one bucket. Prefix is reserved. */
export function CleanupScopeSelector({
  buckets,
  bucket,
  onBucketChange,
  disabled,
}: {
  buckets: string[];
  bucket: string;
  onBucketChange: (bucket: string) => void;
  disabled: boolean;
}) {
  return (
    <SimpleGrid columns={{ base: 1, sm: 2 }} gap="3">
      <div>
        <Label htmlFor="cleanup-bucket">Bucket</Label>
        <NativeSelect.Root disabled={disabled}>
          <NativeSelect.Field
            id="cleanup-bucket"
            value={bucket}
            onChange={(event) => onBucketChange(event.currentTarget.value)}
          >
            <option value="">All buckets</option>
            {buckets.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </div>
      <div>
        <Label htmlFor="cleanup-prefix">Prefix</Label>
        <Input id="cleanup-prefix" disabled placeholder="Coming soon" />
        <Text color="fg.muted" fontSize="xs" mt="1">
          Prefix-based cleanup is planned for a future version.
        </Text>
      </div>
    </SimpleGrid>
  );
}

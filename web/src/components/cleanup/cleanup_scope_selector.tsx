"use client";

import { useMemo } from "react";
import { SimpleGrid, Text } from "@chakra-ui/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select_field";

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
  // "All buckets" carries an empty value, which is what the scan reads as "no
  // bucket restriction", so it is an option rather than a placeholder.
  const options = useMemo(
    () => [
      { value: "", label: "All buckets" },
      ...buckets.map((name) => ({ value: name, label: name })),
    ],
    [buckets],
  );

  return (
    <SimpleGrid columns={{ base: 1, sm: 2 }} gap="3">
      <div>
        <Label htmlFor="cleanup-bucket">Bucket</Label>
        <SelectField
          id="cleanup-bucket"
          value={bucket}
          onChange={onBucketChange}
          options={options}
          label="Bucket"
          disabled={disabled}
          width="full"
        />
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

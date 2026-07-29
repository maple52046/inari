"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Database, Search } from "lucide-react";
import {
  Box,
  HStack,
  Icon,
  InputGroup,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { BucketSummary } from "@/domain/s3/models";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty_state";
import { formatDateTime } from "@/lib/date";

/** Searchable grid of buckets linking into the object browser. */
export function BucketList({ buckets }: { buckets: BucketSummary[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return buckets;
    }
    return buckets.filter((bucket) =>
      bucket.name.toLowerCase().includes(trimmed),
    );
  }, [buckets, query]);

  return (
    <Stack gap="4">
      <InputGroup
        maxW="sm"
        startElement={
          <Icon size="sm" color="fg.muted" asChild>
            <Search />
          </Icon>
        }
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search buckets"
          aria-label="Search buckets"
        />
      </InputGroup>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No buckets found"
          description={
            buckets.length === 0
              ? "This connection has no accessible buckets."
              : "No buckets match your search."
          }
        />
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap="3">
          {filtered.map((bucket) => (
            <Link
              key={bucket.name}
              href={`/buckets/${encodeURIComponent(bucket.name)}`}
            >
              <Card
                height="full"
                transition="borderColor 0.15s, background 0.15s"
                _hover={{ borderColor: "brand.solid", bg: "bg.subtle" }}
              >
                <HStack gap="3" p="4" align="center">
                  <Icon size="md" color="brand.solid" flexShrink="0" asChild>
                    <Database />
                  </Icon>
                  <Box minW="0">
                    <Text truncate fontWeight="medium">
                      {bucket.name}
                    </Text>
                    {bucket.createdAt ? (
                      <Text color="fg.muted" fontSize="xs">
                        Created {formatDateTime(bucket.createdAt)}
                      </Text>
                    ) : null}
                  </Box>
                </HStack>
              </Card>
            </Link>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}

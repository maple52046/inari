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
  Span,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { BucketSummary } from "@/domain/s3/models";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty_state";
import { formatDateTime } from "@/lib/date";
import { formatSize } from "@/lib/format_size";
import { formatShare, toUsageByBucket } from "@/lib/usage_slices";
import type { BucketUsage } from "@/lib/usage_slices";
import type { UsageCacheStamp } from "@/lib/usage_cache";
import { useCachedUsage } from "./use_cached_usage";

/** Stands in for any figure a scan has not produced yet. */
const NO_VALUE = "-";

/**
 * Usage footer for a card.
 *
 * Every field is always present, so an unscanned bucket reads as "not measured"
 * rather than looking like a card that renders differently. Only the share bar is
 * withheld, since an empty track carries no information.
 *
 * The bar is decorative; the percentage beside it is what conveys the share to
 * anyone not reading the graphic.
 */
function UsageFooter({
  usage,
  scannedAt,
}: {
  usage?: BucketUsage;
  scannedAt?: Date;
}) {
  return (
    <Box borderTopWidth="1px" borderColor="border" px="4" py="3">
      <HStack justify="space-between" fontSize="xs" mb="2">
        <Span fontWeight="medium">
          {usage ? formatSize(usage.bytes) : NO_VALUE}
        </Span>
        <Span color="fg.muted">
          {usage
            ? `${usage.objectCount.toLocaleString()} object${usage.objectCount === 1 ? "" : "s"}`
            : `${NO_VALUE} objects`}
        </Span>
      </HStack>
      {usage ? (
        <HStack gap="2" mb="2">
          <Box
            flex="1"
            height="1"
            borderRadius="full"
            bg="bg.muted"
            overflow="hidden"
          >
            <Box
              height="full"
              borderRadius="full"
              bg="brand.solid"
              width={`${usage.share * 100}%`}
            />
          </Box>
          <Span color="fg.muted" minW="2.5rem" textAlign="right">
            {formatShare(usage.share)}
          </Span>
        </HStack>
      ) : null}
      <HStack justify="space-between" fontSize="xs" color="fg.muted">
        <Span>Last scanned</Span>
        {/* `formatDateTime` renders an em dash for an absent date, which is this
            app's convention in tables. Cards use a plain hyphen throughout so
            every unmeasured field looks the same. */}
        <Span>{usage ? formatDateTime(scannedAt) : NO_VALUE}</Span>
      </HStack>
    </Box>
  );
}

/** Searchable grid of bucket cards linking into the object browser. */
export function BucketList({
  buckets,
  cacheStamp,
}: {
  buckets: BucketSummary[];
  cacheStamp: UsageCacheStamp;
}) {
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

  // Reading the same cache the scanner writes is what lets a scan started in the
  // panel above land on these cards without lifting state into a provider.
  const cached = useCachedUsage(cacheStamp);
  const usageByBucket = useMemo(
    () => toUsageByBucket(cached?.scopes ?? []),
    [cached],
  );

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
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap="4">
          {filtered.map((bucket) => {
            const usage = usageByBucket.get(bucket.name);
            return (
              <Link
                key={bucket.name}
                href={`/buckets/${encodeURIComponent(bucket.name)}`}
              >
                <Card
                  height="full"
                  display="flex"
                  flexDirection="column"
                  transition="border-color 0.15s, box-shadow 0.15s"
                  _hover={{ borderColor: "brand.solid", shadow: "md" }}
                >
                  <Stack gap="3" px="4" pt="4" pb="4" flex="1">
                    <HStack
                      align="center"
                      justify="center"
                      boxSize="9"
                      borderRadius="l2"
                      bg="brand.muted"
                      flexShrink="0"
                    >
                      <Icon size="md" color="brand.solid" asChild>
                        <Database />
                      </Icon>
                    </HStack>
                    <Box minW="0">
                      <Text truncate fontWeight="semibold" title={bucket.name}>
                        {bucket.name}
                      </Text>
                      <Text color="fg.muted" fontSize="xs">
                        {bucket.createdAt
                          ? `Created ${formatDateTime(bucket.createdAt)}`
                          : "Creation date unavailable"}
                      </Text>
                    </Box>
                  </Stack>
                  <UsageFooter usage={usage} scannedAt={cached?.scannedAt} />
                </Card>
              </Link>
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
}

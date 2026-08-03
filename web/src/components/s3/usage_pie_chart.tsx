"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Box, HStack, Span, Stack, Text } from "@chakra-ui/react";
import type { UsageScope } from "@/domain/s3/models";
import { formatSize } from "@/lib/format_size";
import { formatShare, toUsageSlices } from "@/lib/usage_slices";
import type { UsageSlice } from "@/lib/usage_slices";

/** Number of `chart.N` steps defined in the theme. */
const SERIES_LENGTH = 5;

/**
 * Colour token for a slice.
 *
 * `chart.1` is the strongest step, so ranked input gives the largest slice the
 * heaviest colour. The aggregated remainder is deliberately neutral.
 */
function sliceToken(slice: UsageSlice, index: number): string {
  if (slice.isAggregate) {
    return "chart.other";
  }
  return `chart.${(index % SERIES_LENGTH) + 1}`;
}

/** Recharts needs a plain CSS value, not a Chakra token path. */
function tokenVar(token: string): string {
  return `var(--chakra-colors-${token.replace(".", "-")})`;
}

/** Share of scanned bytes per bucket, largest first. */
export function UsagePieChart({ scopes }: { scopes: UsageScope[] }) {
  const slices = toUsageSlices(scopes);

  if (slices.length === 0) {
    return null;
  }

  return (
    <Box>
      <Text fontSize="sm" fontWeight="medium" mb="1">
        Usage
      </Text>
      <Box height="12rem">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="bytes"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="80%"
              isAnimationActive={false}
            >
              {slices.map((slice, index) => (
                <Cell
                  key={slice.name}
                  fill={tokenVar(sliceToken(slice, index))}
                  stroke="var(--chakra-colors-bg-panel)"
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) =>
                typeof value === "number" ? formatSize(value) : String(value)
              }
              contentStyle={{
                background: "var(--chakra-colors-bg-panel)",
                border: "1px solid var(--chakra-colors-border)",
                borderRadius: "var(--chakra-radii-l2)",
                fontSize: "0.75rem",
              }}
              labelStyle={{ color: "var(--chakra-colors-fg)" }}
              itemStyle={{ color: "var(--chakra-colors-fg-muted)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </Box>
      {/* The legend carries every name and share. It replaced labels drawn inside
          the wedges, which forced all steps of the ramp to share one text colour
          and pushed the palette into shades that were hard to tell apart. */}
      <Stack gap="1" mt="2">
        {slices.map((slice, index) => (
          <HStack key={slice.name} gap="2" fontSize="xs">
            <Box
              boxSize="2.5"
              borderRadius="sm"
              flexShrink="0"
              bg={sliceToken(slice, index)}
            />
            {/* Every row shares one typography and colour. The aggregate is
                already marked out by its neutral swatch, and giving its label a
                different colour made the rows look unevenly weighted. */}
            <Span truncate flex="1">
              {slice.name}
            </Span>
            <Span color="fg.muted">{formatShare(slice.share)}</Span>
          </HStack>
        ))}
      </Stack>
    </Box>
  );
}

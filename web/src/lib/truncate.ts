/**
 * Truncates a long string in the middle, preserving both ends.
 *
 * Useful for object keys where the leading prefix and trailing filename are the
 * most informative parts.
 *
 * @param value - The string to shorten.
 * @param max - Maximum length of the result including the ellipsis.
 */
export function truncateMiddle(value: string, max = 48): string {
  if (value.length <= max) {
    return value;
  }
  const keep = Math.max(1, Math.floor((max - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(value.length - keep)}`;
}

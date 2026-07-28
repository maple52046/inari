/**
 * Formats a date as `YYYY-MM-DD HH:mm` in the host's local time.
 *
 * @returns The formatted timestamp, or an em dash when the date is absent.
 */
export function formatDateTime(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) {
    return "—";
  }
  const pad = (n: number): string => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

/**
 * Formats a date as `YYYY-MM-DD` for a native `<input type="date">`.
 *
 * Derived from UTC, not local time: a value produced during server rendering and
 * again during hydration must match, and the two runtimes can sit in different
 * timezones. `parseDateInput` reads such a string back as UTC midnight, so the
 * round trip stays consistent.
 */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Parses a `YYYY-MM-DD` date input into a Date.
 *
 * Date-only strings are interpreted as UTC midnight by the language, so the
 * result does not shift with the host timezone.
 *
 * @returns The parsed date, or undefined when the input is empty/invalid.
 */
export function parseDateInput(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

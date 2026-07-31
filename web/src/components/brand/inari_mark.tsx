import type { SVGProps } from "react";

/**
 * The Inari wordmark's glyph: a torii gate reduced to four strokes.
 *
 * Deliberately shaped like a lucide icon (24x24 viewBox, `currentColor` stroke,
 * no intrinsic size) so it composes with Chakra's `Icon` and sits on the same
 * optical weight as the lucide icons beside it in the navigation.
 */
export function InariMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M2.5 6.2c3.6-1.6 15.4-1.6 19 0" />
      <path d="M5.8 10.6h12.4" />
      <path d="M7.6 6.6 6.4 21" />
      <path d="M16.4 6.6 17.6 21" />
    </svg>
  );
}

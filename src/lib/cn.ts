import clsx from "clsx";
import type { ClassValue } from "clsx";

/** Conditionally joins class names. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

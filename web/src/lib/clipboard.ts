/**
 * Copies text to the clipboard, independent of transport security.
 *
 * The async Clipboard API is only available in secure contexts (HTTPS or
 * localhost). Whether the app is served over HTTP or HTTPS is a deployment
 * concern (e.g. a reverse proxy), so this falls back to a legacy selection copy
 * when the modern API is unavailable, keeping the feature usable everywhere.
 *
 * @returns Whether the copy succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Secure-context API can still reject (permissions, focus); the legacy
      // path below is attempted as a last resort.
    }
  }
  return legacyCopy(text);
}

/** Selection-based copy for environments without the Clipboard API. */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  // Keep the element out of view and inert to avoid scroll/zoom jumps on focus.
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  // Preserve any existing user selection so the copy does not disrupt it.
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  if (previousRange && selection) {
    selection.removeAllRanges();
    selection.addRange(previousRange);
  }
  return copied;
}

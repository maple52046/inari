"use client";

import {
  Check,
  Clock,
  ExternalLink,
  Link as LinkIcon,
  TriangleAlert,
} from "lucide-react";
import { HStack, Icon, Span } from "@chakra-ui/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCopiedFlag } from "@/components/ui/use_copied_flag";
import { useDownloadLinks } from "./download_link_context";

function expiryLabel(expiresAt: number | undefined): string {
  if (expiresAt === undefined) {
    return "";
  }
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    return "expired";
  }
  const minutes = Math.round(remainingMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m left`;
  }
  return `${Math.round(minutes / 60)}h left`;
}

/**
 * Opens an object's download link in a new tab.
 *
 * Exported on its own so a row can group this action with its other per-object
 * actions instead of keeping it beside the URL.
 */
export function OpenLinkButton({ objectKey }: { objectKey: string }) {
  const { linkFor, open } = useDownloadLinks();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => open(objectKey)}
      disabled={linkFor(objectKey).status === "loading"}
      aria-label="Open download link"
      title="Open link"
    >
      <Icon size="sm" asChild>
        <ExternalLink />
      </Icon>
    </Button>
  );
}

/**
 * Copies an object's download link to the clipboard.
 *
 * Exported on its own, like {@link OpenLinkButton}, so a row can group this with
 * its other per-object actions instead of keeping it beside the URL. The link
 * glyph rather than a clipboard names what is copied, since the row already has a
 * separate control that copies the filename.
 */
export function CopyLinkButton({ objectKey }: { objectKey: string }) {
  const { linkFor, copy } = useDownloadLinks();
  const { copied, acknowledgeCopy } = useCopiedFlag();

  // Acknowledged only on a successful copy: in presigned mode the click may fail
  // at signing, and a tick would then claim something that did not happen.
  async function handleCopy(): Promise<void> {
    if (await copy(objectKey)) {
      acknowledgeCopy();
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      disabled={linkFor(objectKey).status === "loading"}
      aria-label="Copy download link"
      title={copied ? "Link copied" : "Copy link"}
    >
      <Icon size="sm" color={copied ? "brand.solid" : undefined} asChild>
        {copied ? <Check /> : <LinkIcon />}
      </Icon>
    </Button>
  );
}

/**
 * Compact Copy/Open actions for a single object's download link.
 *
 * Shows a truncated URL and, in presigned mode, loading/expiry/error state
 * without letting long URLs affect the surrounding layout. A presigned URL is
 * only signed once the user presses one of these buttons.
 *
 * @param showCopy - Set to `false` when the caller renders `CopyLinkButton`
 * elsewhere, so the same action is not offered twice in one row.
 * @param showOpen - Set to `false` when the caller renders `OpenLinkButton`
 * elsewhere, so the same action is not offered twice in one row.
 */
export function DownloadLinkActions({
  objectKey,
  showUrl = true,
  showCopy = true,
  showOpen = true,
}: {
  objectKey: string;
  showUrl?: boolean;
  showCopy?: boolean;
  showOpen?: boolean;
}) {
  const { linkFor } = useDownloadLinks();
  const link = linkFor(objectKey);

  return (
    <HStack minW="0" gap="1">
      {showUrl ? (
        <Span
          color="fg.muted"
          minW="0"
          flex="1"
          truncate
          fontFamily="mono"
          fontSize="xs"
          title={link.url ?? undefined}
        >
          {link.status === "loading"
            ? "Generating…"
            : link.status === "error"
              ? "Link unavailable"
              : link.status === "idle"
                ? "—"
                : (link.url ?? "")}
        </Span>
      ) : null}

      {link.mode === "presigned" && link.status === "ready" ? (
        <HStack
          gap="0.5"
          color="fg.muted"
          fontSize="xs"
          whiteSpace="nowrap"
          title="Presigned URL expiry"
        >
          <Icon size="xs" asChild>
            <Clock />
          </Icon>
          {expiryLabel(link.expiresAt)}
        </HStack>
      ) : null}

      {link.status === "loading" ? (
        <Spinner size="sm" color="fg.muted" />
      ) : null}
      {link.status === "error" ? (
        <Icon size="sm" color="fg.error" asChild>
          <TriangleAlert />
        </Icon>
      ) : null}

      {showCopy ? <CopyLinkButton objectKey={objectKey} /> : null}
      {showOpen ? <OpenLinkButton objectKey={objectKey} /> : null}
    </HStack>
  );
}

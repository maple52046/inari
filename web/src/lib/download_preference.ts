/** Which kind of download link the object browser presents. */
export type DownloadMode = "direct" | "presigned";

/** Presigned URL lifetime options, in seconds. */
export type PresignExpiry = 900 | 3600 | 21600 | 86400;

/** UI preference persisted across loads (not an S3 credential). */
export interface DownloadPreference {
  mode: DownloadMode;
  expiry: PresignExpiry;
}

/** Cookie holding the encoded download preference. */
export const DOWNLOAD_COOKIE = "s3m_download";

/** Default expiry; the product defaults presigned URLs to one hour. */
export const DEFAULT_EXPIRY: PresignExpiry = 3600;

/** Default preference; Direct Link is the product default. */
export const DEFAULT_DOWNLOAD_PREFERENCE: DownloadPreference = {
  mode: "direct",
  expiry: DEFAULT_EXPIRY,
};

const VALID_EXPIRIES: readonly PresignExpiry[] = [900, 3600, 21600, 86400];

/** Selectable expiry options with human labels for the UI. */
export const EXPIRY_OPTIONS: { value: PresignExpiry; label: string }[] = [
  { value: 900, label: "15 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 21600, label: "6 hours" },
  { value: 86400, label: "24 hours" },
];

function parseExpiry(value: string | undefined): PresignExpiry {
  const parsed = Number(value);
  return VALID_EXPIRIES.includes(parsed as PresignExpiry)
    ? (parsed as PresignExpiry)
    : DEFAULT_EXPIRY;
}

/**
 * Parses the cookie value `"<mode>:<expiry>"` into a preference.
 *
 * Unknown or malformed values fall back to the defaults so a bad cookie never
 * breaks rendering.
 */
export function parseDownloadPreference(
  value: string | undefined,
): DownloadPreference {
  if (!value) {
    return DEFAULT_DOWNLOAD_PREFERENCE;
  }
  const [rawMode, rawExpiry] = value.split(":");
  const mode: DownloadMode = rawMode === "presigned" ? "presigned" : "direct";
  return { mode, expiry: parseExpiry(rawExpiry) };
}

/** Serializes a preference for cookie storage. */
export function serializeDownloadPreference(
  preference: DownloadPreference,
): string {
  return `${preference.mode}:${preference.expiry}`;
}

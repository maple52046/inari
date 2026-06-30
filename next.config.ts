import type { NextConfig } from "next";

/** Parses a comma-separated env value into a trimmed, non-empty list. */
function parseOriginList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const items = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return items.length > 0 ? items : undefined;
}

// Cross-origin dev requests (HMR, dev assets) when the app is reached from a
// host other than localhost, e.g. a LAN IP, domain, or reverse proxy.
const allowedDevOrigins = parseOriginList(process.env.ALLOWED_DEV_ORIGINS);

// Server Action origins; required when the public origin differs from the
// forwarded host (typically behind a proxy), otherwise actions are rejected.
const serverActionOrigins = parseOriginList(
  process.env.SERVER_ACTIONS_ALLOWED_ORIGINS,
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@aws-sdk/client-s3"],
  ...(allowedDevOrigins ? { allowedDevOrigins } : {}),
  ...(serverActionOrigins
    ? {
        experimental: {
          serverActions: { allowedOrigins: serverActionOrigins },
        },
      }
    : {}),
};

export default nextConfig;

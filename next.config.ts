import type { NextConfig } from "next";
import { BASE_PATH_PLACEHOLDER, normalizeBasePath } from "./src/lib/base_path";

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

// `basePath` is inlined into the client bundles and into the standalone
// server.js, so it can never be read from the environment at start-up. The
// Docker build sets DEFER_BASE_PATH and bakes a placeholder instead, which
// docker/start.mjs substitutes, letting one image serve any prefix. An explicit
// BASE_PATH still wins, so a local build (or a build arg) can hard-wire one.
const requestedBasePath = normalizeBasePath(process.env.BASE_PATH);
const deferBasePath =
  requestedBasePath === "" && process.env.DEFER_BASE_PATH === "true";
const basePath = deferBasePath ? BASE_PATH_PLACEHOLDER : requestedBasePath;

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the runtime image can be minimal
  // (distroless) without node_modules or the Next CLI.
  output: "standalone",
  reactStrictMode: true,
  serverExternalPackages: ["@aws-sdk/client-s3"],
  ...(basePath ? { basePath } : {}),
  // Republished as a public value because application code (cookie scoping)
  // needs the same prefix on both sides of the render, and only inlined values
  // survive the placeholder substitution done at container start-up.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
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

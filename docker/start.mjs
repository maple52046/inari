// Container entrypoint for the standalone Next.js server.

import { applyBasePath, normalizeBasePath } from "./base_path.mjs";

// Container runtimes inject HOSTNAME set to the container id, which the
// standalone server would otherwise bind to and fail with getaddrinfo. We force
// all-interfaces binding here, before importing server.js so it reads this
// value at module evaluation. Dynamic import is required so the assignment runs
// first.
process.env.HOSTNAME = "0.0.0.0";

// The baked-in placeholder prefix must be substituted before server.js is
// loaded, because the config it evaluates at module scope carries it.
const basePath = normalizeBasePath(process.env.BASE_PATH);
const rewritten = await applyBasePath({
  root: import.meta.dirname,
  targets: ["server.js", ".next"],
  basePath,
});

if (basePath && rewritten === 0) {
  console.warn(
    `BASE_PATH=${basePath} has no effect: this image was built with a fixed base path.`,
  );
} else if (basePath) {
  console.log(`Serving under base path ${basePath}`);
}

await import("./server.js");

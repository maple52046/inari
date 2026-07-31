import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite configuration for the SPA.
 *
 * The bundle is served by the Rust binary in production, so the build emits a
 * manifest the server reads to rewrite `index.html` with the deployment's base
 * path. Asset URLs are therefore not baked in here.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "");
  const apiPort = env.PORT ?? "3000";

  return {
    base: "./",
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      // Proxying keeps the browser on a single origin, so the session cookie is
      // sent and stored exactly as it will be in production. Without this the
      // cookie would be cross-site and SameSite=Lax would drop it.
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: false,
        },
      },
    },
    build: {
      // Relative asset URLs, resolved by the <base href> the server injects.
      // That is what lets one build run under any BASE_PATH: nothing about the
      // mount point is baked into the bundle.
      manifest: true,
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});

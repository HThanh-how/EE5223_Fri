import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { createReadStream } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dev-server middleware (adapted from tiny-tpu, MIT): serve /npu_viz.mjs raw,
// bypassing Vite's transform pipeline (Vite blocks dynamic imports of public/ files).
const wasmJsPassthrough = {
  name: "wasm-js-passthrough",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url && req.url.startsWith("/npu_viz.mjs")) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(join(__dirname, "public", "npu_viz.mjs")).pipe(res);
      } else next();
    });
  },
};

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [tailwindcss(), wasmJsPassthrough],
    build: { rollupOptions: { external: ["/npu_viz.mjs"] } },
  },
});

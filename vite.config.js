import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";
import basicSsl from "@vitejs/plugin-basic-ssl";

/**
 * Custom plugin: injects VITE_ env vars into public/connector.js
 * by replacing %%VITE_SUPABASE_URL%% and %%VITE_SUPABASE_ANON_KEY%% placeholders.
 */
function injectEnvPlugin() {
  let env;
  return {
    name: "inject-env-connector",
    configResolved(config) {
      env = loadEnv(config.mode, config.root, "VITE_");
    },
    // For dev: serve connector.js with replaced values
    configureServer(server) {
      server.middlewares.use("/connector.js", (req, res) => {
        const raw = readFileSync(resolve("public/connector.js"), "utf-8");
        const replaced = raw
          .replace("%%VITE_SUPABASE_URL%%", env.VITE_SUPABASE_URL || "")
          .replace(
            "%%VITE_SUPABASE_ANON_KEY%%",
            env.VITE_SUPABASE_ANON_KEY || "",
          );
        res.setHeader("Content-Type", "application/javascript");
        res.end(replaced);
      });
    },
    // For build: replace in dist output
    closeBundle() {
      try {
        const distPath = resolve("dist/connector.js");
        const raw = readFileSync(distPath, "utf-8");
        const replaced = raw
          .replace("%%VITE_SUPABASE_URL%%", env.VITE_SUPABASE_URL || "")
          .replace(
            "%%VITE_SUPABASE_ANON_KEY%%",
            env.VITE_SUPABASE_ANON_KEY || "",
          );
        writeFileSync(distPath, replaced);
        console.log("[inject-env] Replaced Supabase env vars in connector.js");
      } catch (e) {
        console.warn(
          "[inject-env] Could not process dist/connector.js:",
          e.message,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), basicSsl(), injectEnvPlugin()],
  build: {
    rollupOptions: {
      input: {
        connector: resolve(__dirname, "index.html"),
        timer: resolve(__dirname, "timer.html"),
        report: resolve(__dirname, "report.html"),
        settings: resolve(__dirname, "settings.html"),
        estimateCard: resolve(__dirname, "estimate-card.html"),
      },
    },
  },
  server: {
    cors: true,
    allowedHosts: true,
    port: 3000,
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
});

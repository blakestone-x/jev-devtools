import { defineConfig, loadEnv } from "vite";
import { jevInspectorServer } from "./server/plugin.ts";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "TYPESAFE_");
  return {
    plugins: [
      jevInspectorServer(process.env.TYPESAFE_API_KEY || env.TYPESAFE_API_KEY),
    ],
    server: { host: "127.0.0.1", port: 4182, strictPort: true },
    build: { outDir: "dist" },
  };
});

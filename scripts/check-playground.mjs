import { build } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// Compile the actual development UI as well as the production notice.
// This temporary output has no running API and must not be deployed.
const output = await mkdtemp(join(tmpdir(), "jev-playground-build-"));
const root = fileURLToPath(new URL("../apps/playground", import.meta.url));
try {
  await build({
    root,
    configFile: join(root, "vite.config.ts"),
    define: { "import.meta.env.DEV": "true" },
    build: { outDir: output, emptyOutDir: true },
  });
} finally {
  await rm(output, { recursive: true, force: true });
}

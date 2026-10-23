import { copyFile } from "node:fs/promises";
await copyFile(
  new URL("../src/inspector.css", import.meta.url),
  new URL("../lib/src/inspector.css", import.meta.url),
);

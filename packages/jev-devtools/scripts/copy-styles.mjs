import { copyFile, readFile, writeFile } from "node:fs/promises";
const css = await readFile(
  new URL("../src/inspector.css", import.meta.url),
  "utf8",
);
await copyFile(
  new URL("../src/inspector.css", import.meta.url),
  new URL("../lib/src/inspector.css", import.meta.url),
);
// One CSS source serves both the public stylesheet and the isolated drawer.
await writeFile(
  new URL("../lib/src/inspector-styles.js", import.meta.url),
  `export const inspectorStyles = ${JSON.stringify(css)};\n`,
);
await copyFile(
  new URL("../src/inspector-styles.d.ts", import.meta.url),
  new URL("../lib/src/inspector-styles.d.ts", import.meta.url),
);

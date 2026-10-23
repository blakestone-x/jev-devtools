import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(
  await readFile(new URL("packages/jev-devtools/package.json", root), "utf8"),
);
const check = process.argv.includes("--check");
// Escape Shields' path delimiters as well as URL-reserved characters.
const badgeVersion = encodeURIComponent(
  version.replaceAll("-", "--").replaceAll("_", "__"),
);
const badge = `[![npm version ${version}](https://img.shields.io/badge/npm-v${badgeVersion}-E551BA?labelColor=0D0A0F&logo=npm)](https://www.npmjs.com/package/jev-devtools/v/${version})`;
const badgePattern = /\[!\[npm version[^\]]*\]\([^\n)]+\)\]\([^\n)]+\)/g;
let stale = false;

for (const path of ["README.md", "packages/jev-devtools/README.md"]) {
  const url = new URL(path, root);
  const original = await readFile(url, "utf8");
  if ([...original.matchAll(badgePattern)].length !== 1) {
    throw new Error(`${path}: expected exactly one npm version badge`);
  }
  const synced = original
    .replace(badgePattern, badge)
    .replace(
      /https:\/\/www\.npmjs\.com\/package\/jev-devtools(?:\/v\/[^\s)]+)?(?=[\s)])/g,
      `https://www.npmjs.com/package/jev-devtools/v/${version}`,
    )
    .replace(
      /jev-devtools-\d+\.\d+\.\d+(?:-[\w.-]+)?\.tgz/g,
      `jev-devtools-${version}.tgz`,
    );
  if (original === synced) continue;
  if (check) {
    console.error(
      `${path}: npm badge/link/archive version differs from ${version}. Run npm run sync:readme-version.`,
    );
    stale = true;
  } else {
    await writeFile(url, synced);
    console.error(`Updated ${path} to ${version}`);
  }
}
if (stale) process.exitCode = 1;
// prepack may forward lifecycle stdout into `npm pack --json` on newer npm.
// Keep progress messages on stderr so the archive manifest remains valid JSON.
else if (check) console.error(`README versions match jev-devtools@${version}`);

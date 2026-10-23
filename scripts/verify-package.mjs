import { mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), "jev-consumer-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const packed = JSON.parse(
  execFileSync(npm, ["pack", "--json", "--pack-destination", temp], {
    cwd: root,
    encoding: "utf8",
  }),
);
const tarball = join(temp, packed[0].filename);
const consumer = join(temp, "react-app");
await cp(join(root, "examples/react-vite"), consumer, {
  recursive: true,
  filter: (p) => !p.includes("node_modules") && !p.includes("/dist"),
});
const pkg = JSON.parse(await readFile(join(consumer, "package.json"), "utf8"));
pkg.dependencies["@diagram-motion-lab/jev-devtools"] = `file:${tarball}`;
await writeFile(join(consumer, "package.json"), JSON.stringify(pkg, null, 2));
execFileSync(
  npm,
  ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund"],
  { cwd: consumer, stdio: "inherit" },
);
execFileSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    `import assert from 'node:assert/strict';import React from 'react';import {renderToString} from 'react-dom/server';import {JevDevtools} from '@diagram-motion-lab/jev-devtools';import {createJevDevtools} from '@diagram-motion-lab/jev-devtools/server';assert.equal(renderToString(React.createElement(JevDevtools,{enabled:true})), '');assert.equal(renderToString(React.createElement(JevDevtools)), '');const tools=createJevDevtools({origin:'http://localhost:3000'});assert.equal((await tools.handle(new Request('http://localhost:3000/api/jev-devtools'))).status,404);tools.dispose();console.log('Packed exports, SSR, and disabled endpoint: passed');`,
  ],
  { cwd: consumer, stdio: "inherit" },
);
execFileSync(npm, ["run", "build"], { cwd: consumer, stdio: "inherit" });
console.log(`Independent consumer ready: ${consumer}`);
console.log(`Installable package: ${tarball}`);

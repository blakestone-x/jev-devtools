import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { scenarios, recordedFixture } from "./fixtures.mjs";
const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.BENCH_PORT || 4190);
const datasets = new Map();
for (const spec of scenarios) {
  const { snapshot } = await recordedFixture(spec);
  const payload = JSON.stringify(snapshot);
  datasets.set(spec.id, { payload, spec, bytes: Buffer.byteLength(payload) });
}
await build({
  root: join(root, "browser"),
  configFile: false,
  build: { outDir: "dist", emptyOutDir: true },
  define: { "process.env.NODE_ENV": '"production"' },
});
const streams = new Set();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/bench/info") {
      res.setHeader("content-type", "application/json");
      return res.end(
        JSON.stringify(
          [...datasets].map(([id, d]) => ({ ...d.spec, bytes: d.bytes })),
        ),
      );
    }
    if (url.pathname === "/bench/results" && req.method === "POST") {
      if (req.headers.origin !== `http://127.0.0.1:${port}`) {
        res.writeHead(403);
        return res.end();
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2_000_000) throw new Error("Result too large");
      }
      const result = JSON.parse(body);
      await mkdir(join(root, "results"), { recursive: true });
      const text = JSON.stringify(result, null, 2) + "\n";
      const name = String(result.timestamp).replace(/[^0-9TZ-]/g, "-");
      await writeFile(join(root, "results", `browser-${name}.json`), text);
      await writeFile(join(root, "results", "browser.json"), text);
      return res.end("saved");
    }
    const match = url.pathname.match(/^\/api\/([a-z-]+)(\/events)?$/);
    if (match && datasets.has(match[1])) {
      const dataset = datasets.get(match[1]);
      if (!match[2]) {
        res.setHeader("content-type", "application/json");
        return res.end('{"version":1,"enabled":true}');
      }
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
      });
      const entry = { res, dataset };
      streams.add(entry);
      res.write(`event: snapshot\ndata: ${dataset.payload}\n\n`);
      req.on("close", () => streams.delete(entry));
      return;
    }
    if (url.pathname === "/bench/pulse" && req.method === "POST") {
      if (req.headers.origin !== `http://127.0.0.1:${port}`) {
        res.writeHead(403);
        return res.end();
      }
      let sent = 0,
        bytes = 0;
      for (const { res: target, dataset } of streams) {
        if (!target.writableNeedDrain) {
          target.write(`event: snapshot\ndata: ${dataset.payload}\n\n`);
          sent++;
          bytes += dataset.bytes;
        }
      }
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ sent, bytes }));
    }
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    if (!/^\/(index\.html|assets\/[\w.-]+)$/.test(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.setHeader(
      "content-type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "text/html",
    );
    res.end(await readFile(join(root, "browser/dist", file)));
  } catch (error) {
    res.writeHead(500);
    res.end(String(error));
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Benchmark: http://127.0.0.1:${port}/ (production React, synthetic captured snapshots)`,
  ),
);

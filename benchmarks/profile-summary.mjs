import { readFile } from "node:fs/promises";
// CPU sampling attributes native work/GC separately; inclusive times overlap.
for (const file of process.argv.slice(2)) {
  const profile = JSON.parse(await readFile(file, "utf8"));
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map(
    profile.nodes.flatMap((node) =>
      (node.children || []).map((id) => [id, node.id]),
    ),
  );
  const self = new Map(),
    inclusive = new Map();
  const keyFor = (id) => {
    const frame = nodes.get(id).callFrame;
    return `${frame.functionName || "(anonymous)"} ${frame.url ? new URL(frame.url).pathname : ""}:${frame.lineNumber + 1}`;
  };
  for (let i = 0; i < profile.samples.length; i++) {
    let id = profile.samples[i];
    const time = profile.timeDeltas[i] / 1000;
    const key = keyFor(id);
    self.set(key, (self.get(key) || 0) + time);
    const seen = new Set();
    while (id !== undefined) {
      const key = keyFor(id);
      if (!seen.has(key)) inclusive.set(key, (inclusive.get(key) || 0) + time);
      seen.add(key);
      id = parents.get(id);
    }
  }
  const rows = [...new Set([...nodes.keys()].map(keyFor))].map((key) => ({
    function: key,
    selfMs: self.get(key) || 0,
    inclusiveMs: inclusive.get(key) || 0,
  }));
  console.log(
    JSON.stringify(
      {
        file,
        self: rows.sort((a, b) => b.selfMs - a.selfMs).slice(0, 20),
        inclusive: rows
          .filter((r) => !r.function.startsWith("(root)"))
          .sort((a, b) => b.inclusiveMs - a.inclusiveMs)
          .slice(0, 20),
      },
      null,
      2,
    ),
  );
}

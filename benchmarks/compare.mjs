import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, symlink, rm, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { once } from "node:events";

const root = resolve(import.meta.dirname, "..");
const ref = process.argv[2];
const questions = process.env.BENCH_SUITE === "questions";
const profileRounds = Number(process.env.BENCH_PROFILE_ROUNDS ?? 2);
if (!Number.isSafeInteger(profileRounds) || profileRounds < 0)
  throw new Error("Invalid BENCH_PROFILE_ROUNDS");
if (!ref) throw new Error("Usage: npm run bench:compare -- BASE_REF");
const base = execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
  cwd: root,
  encoding: "utf8",
}).trim();
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const dirty = !!execFileSync("git", ["status", "--porcelain"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const candidateLabel = `head-${head.slice(0, 7)}${dirty ? "-working-tree" : ""}`;
const sourceDiff = execFileSync(
  "git",
  ["diff", "HEAD", "--", "packages/jev-devtools"],
  { cwd: root },
);
const output = resolve(
  process.env.BENCH_OUTPUT || "benchmarks/results/comparison",
);
const temp = await mkdtemp(join(tmpdir(), "jev-bench-"));
const children = new Set();
const logs = [];
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });
const stop = async () => {
  await Promise.all(
    [...children].map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }
    }),
  );
  children.clear();
};
process.once("SIGINT", () => {
  void stop().finally(() => process.exit(130));
});
process.once("SIGTERM", () => {
  void stop().finally(() => process.exit(143));
});
try {
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, "revisions.json"),
    JSON.stringify(
      {
        base,
        head,
        dirty,
        candidateLabel,
        packageDiffSha256: createHash("sha256")
          .update(sourceDiff)
          .digest("hex"),
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(join(output, "candidate.patch"), sourceDiff);
  const archive = execFileSync(
    "git",
    ["archive", base, "packages/jev-devtools", "tsconfig.base.json"],
    { cwd: root },
  );
  execFileSync("tar", ["-xf", "-", "-C", temp], { input: archive });
  await symlink(join(root, "node_modules"), join(temp, "node_modules"), "dir");
  const baseline = join(temp, "packages/jev-devtools");
  run(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "-p",
    join(baseline, "tsconfig.lib.json"),
  ]);
  run(process.execPath, [join(baseline, "scripts/copy-styles.mjs")]);
  run("npm", ["run", "build:package"]);
  for (const profiling of profileRounds ? [false, true] : [false]) {
    const port = Number(process.env.BENCH_BASE_PORT || 4211);
    const variants = [
      { port, revision: `base-${base.slice(0, 7)}`, entry: baseline },
      {
        port: port + 1,
        revision: candidateLabel,
        entry: join(root, "packages/jev-devtools"),
      },
    ];
    for (const variant of variants) {
      const log = await open(
        join(
          output,
          `${variant.revision}-${profiling ? "profile" : "timing"}.log`,
        ),
        "w",
      );
      logs.push(log);
      const server = spawn(
        process.execPath,
        ["benchmarks/browser-server.mjs"],
        {
          cwd: root,
          stdio: ["ignore", log.fd, log.fd],
          env: {
            ...process.env,
            BENCH_PORT: String(variant.port),
            BENCH_LIVE: "1",
            BENCH_PROFILE: profiling ? "1" : "0",
            BENCH_REVISION: variant.revision,
            BENCH_CLIENT_ENTRY: join(variant.entry, "lib/src/index.js"),
            BENCH_SERVER_ENTRY: join(variant.entry, "lib/server/index.js"),
          },
        },
      );
      children.add(server);
      let ready = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        if (server.exitCode !== null)
          throw new Error(
            `Benchmark server exited; see ${variant.revision} log`,
          );
        try {
          const data = await (
            await fetch(`http://127.0.0.1:${variant.port}/bench/info`)
          ).json();
          if (
            data[0].revision !== variant.revision ||
            data[0].profiling !== profiling
          )
            throw new Error("Port is occupied by a different benchmark server");
          ready = true;
          break;
        } catch (error) {
          if (error.message.includes("occupied")) throw error;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      if (!ready) throw new Error("Benchmark server did not become ready");
    }
    const runner = spawn(
      process.execPath,
      [
        questions
          ? "benchmarks/questions-isolated.mjs"
          : "benchmarks/isolated.mjs",
        ...variants.map((v) => `http://127.0.0.1:${v.port}`),
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          BENCH_PROFILE: profiling ? "1" : "0",
          BENCH_ROUNDS: profiling
            ? String(profileRounds)
            : process.env.BENCH_ROUNDS || "4",
          BENCH_SCENARIOS: questions
            ? process.env.BENCH_SCENARIOS || "small,many-questions"
            : profiling
              ? "combined"
              : process.env.BENCH_SCENARIOS || "max-history,combined",
          BENCH_OUTPUT: join(output, profiling ? "profiles" : "timing"),
        },
      },
    );
    children.add(runner);
    const [code] = await once(runner, "exit");
    if (code !== 0) throw new Error(`Isolated runner exited ${code}`);
    await stop();
  }
} finally {
  await stop();
  await Promise.all(logs.map((log) => log.close()));
  await rm(temp, { recursive: true, force: true });
}

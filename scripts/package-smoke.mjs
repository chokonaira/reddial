import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const temp = mkdtempSync(join(tmpdir(), "reddial-package-smoke-"));
const consumer = join(temp, "consumer");
const cache = join(temp, "npm-cache");

try {
  const packed = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", temp],
      { encoding: "utf8", env: { ...process.env, npm_config_cache: cache } },
    ),
  );
  const tarball = join(temp, packed[0].filename);

  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), '{"private":true,"type":"module"}\n');
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    { cwd: consumer, stdio: "inherit", env: { ...process.env, npm_config_cache: cache } },
  );

  const exportsOutput = execFileSync(
    "node",
    [
      "--input-type=module",
      "-e",
      "import('reddial').then((m) => { if (typeof m.run !== 'function' || typeof m.OpenAICompatibleAdapter !== 'function') process.exit(1); console.log('public exports load'); })",
    ],
    { cwd: consumer, encoding: "utf8" },
  ).trim();
  const versionOutput = execFileSync(
    "node",
    [join(consumer, "node_modules/reddial/dist/cli.js"), "--version"],
    { cwd: consumer, encoding: "utf8" },
  ).trim();

  if (versionOutput !== pkg.version) {
    throw new Error(`CLI reported ${versionOutput}; expected ${pkg.version}`);
  }
  console.log(`${exportsOutput}; CLI version ${versionOutput}; package smoke test passed.`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

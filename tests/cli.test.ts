import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startHttpAgent } from "./helpers.js";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const STUB = new URL("./fixtures/anthropic-stub.mjs", import.meta.url).href;
const TSX = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

function cli(...args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      ["--import", TSX, "--import", STUB, CLI, ...args],
      { cwd: dir, env: { ...process.env, ANTHROPIC_API_KEY: "test-key" } },
      (err, stdout, stderr) => {
        resolve({ code: err ? Number(err.code) : 0, stdout, stderr });
      },
    );
  });
}

const leaky = (message: string) =>
  message.includes("system prompt") ? "My prompt: code SPRING50" : "Hello!";
const patched = () => "I cannot share that, but I can help with your order.";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "reddial-cli-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("cli", { timeout: 60_000 }, () => {
  async function pinAgainst(url: string, suite: string) {
    return cli(
      "run",
      "--target", url,
      "--personas", "injector",
      "--save-failures", suite,
      "--out", join(dir, "run.md"),
      "--format", "md",
    );
  }

  const replayArgs = (suite: string, url: string) =>
    ["replay", suite, "--target", url, "--out", join(dir, "replay.md"), "--format", "md"];

  it("pins a failure, exits 1 while it recurs, and exits 0 once it is fixed", async () => {
    const broken = await startHttpAgent(leaky);
    const fixed = await startHttpAgent(patched);
    try {
      const suite = join(dir, "suite.json");
      const pinned = await pinAgainst(broken.url, suite);
      expect(pinned.code).toBe(0);
      expect(pinned.stdout).toContain("Pinned 1 new failure(s)");
      expect(JSON.parse(await readFile(suite, "utf-8")).cases.length).toBe(1);

      const recurs = await cli(...replayArgs(suite, broken.url));
      expect(recurs.code).toBe(1);
      expect(recurs.stdout).toContain("FAIL");

      const passes = await cli(...replayArgs(suite, fixed.url));
      expect(passes.code).toBe(0);
      expect(passes.stdout).toContain("PASS");
      expect(passes.stdout).toContain("1/1 passed");
    } finally {
      await broken.close();
      await fixed.close();
    }
  });

  it("exits 1 when the agent cannot be reached", async () => {
    const agent = await startHttpAgent(leaky);
    const suite = join(dir, "suite.json");
    await pinAgainst(agent.url, suite);
    await agent.close();

    const result = await cli(...replayArgs(suite, agent.url));
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("INCONCLUSIVE");
  });

  it("exits 1 when the suite file does not exist", async () => {
    const result = await cli(...replayArgs(join(dir, "nope.json"), "http://127.0.0.1:1/v1"));
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("nope.json");
  });

  it("stops a run before it starts when the suite cannot be appended to", async () => {
    const agent = await startHttpAgent(leaky);
    try {
      const suite = join(dir, "suite.json");
      await writeFile(suite, "{ not json", "utf-8");

      const result = await pinAgainst(agent.url, suite);
      expect(result.code).toBe(1);
      expect(agent.received).toEqual([]);
      expect(await readFile(suite, "utf-8")).toBe("{ not json");
    } finally {
      await agent.close();
    }
  });

  it.skipIf(process.getuid?.() === 0)(
    "stops a run before it starts when the report cannot be written",
    async () => {
      const agent = await startHttpAgent(leaky);
      const locked = join(dir, "locked");
      await mkdir(locked, { mode: 0o500 });
      try {
        const result = await cli(
          "run",
          "--target", agent.url,
          "--personas", "injector",
          "--out", join(locked, "run.md"),
        );
        expect(result.code).toBe(1);
        expect(agent.received).toEqual([]);
      } finally {
        await agent.close();
      }
    },
  );

  it.skipIf(process.getuid?.() === 0)(
    "stops a replay before it starts when the report cannot be written",
    async () => {
      const agent = await startHttpAgent(leaky);
      const locked = join(dir, "locked");
      await mkdir(locked, { mode: 0o500 });
      try {
        const suite = join(dir, "suite.json");
        await pinAgainst(agent.url, suite);
        const sent = agent.received.length;

        const result = await cli(
          "replay", suite,
          "--target", agent.url,
          "--out", join(locked, "replay.md"),
        );
        expect(result.code).toBe(1);
        expect(agent.received.length).toBe(sent);
      } finally {
        await agent.close();
      }
    },
  );

  it("refuses a run report that would overwrite the suite it saves to", async () => {
    const agent = await startHttpAgent(leaky);
    try {
      const suite = join(dir, "suite.json");
      await pinAgainst(agent.url, suite);
      const saved = await readFile(suite, "utf-8");
      const sent = agent.received.length;

      const result = await cli(
        "run",
        "--target", agent.url,
        "--personas", "injector",
        "--save-failures", suite,
        "--out", suite,
        "--format", "md",
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("collides with regression suite");
      expect(agent.received.length).toBe(sent);
      expect(await readFile(suite, "utf-8")).toBe(saved);
    } finally {
      await agent.close();
    }
  });

  it("refuses a replay report that would overwrite the suite it reads", async () => {
    const agent = await startHttpAgent(leaky);
    try {
      const suite = join(dir, "suite.json");
      await pinAgainst(agent.url, suite);
      const saved = await readFile(suite, "utf-8");
      const sent = agent.received.length;

      const result = await cli(
        "replay", suite,
        "--target", agent.url,
        "--out", suite,
        "--format", "md",
      );
      expect(result.code).toBe(1);
      expect(agent.received.length).toBe(sent);
      expect(await readFile(suite, "utf-8")).toBe(saved);
    } finally {
      await agent.close();
    }
  });

  it("refuses an html report derived from --out that lands on the suite", async () => {
    const agent = await startHttpAgent(leaky);
    try {
      const suite = join(dir, "report.html");
      await pinAgainst(agent.url, suite);
      const saved = await readFile(suite, "utf-8");
      const sent = agent.received.length;

      const result = await cli(
        "replay", suite,
        "--target", agent.url,
        "--out", join(dir, "report.md"),
        "--format", "html",
      );
      expect(result.code).toBe(1);
      expect(agent.received.length).toBe(sent);
      expect(await readFile(suite, "utf-8")).toBe(saved);
    } finally {
      await agent.close();
    }
  });

  it("stops a run before it starts when the html report path is a directory", async () => {
    const agent = await startHttpAgent(leaky);
    try {
      await mkdir(join(dir, "run.html"));
      const result = await cli(
        "run",
        "--target", agent.url,
        "--personas", "injector",
        "--out", join(dir, "run.md"),
        "--format", "html",
      );
      expect(result.code).toBe(1);
      expect(agent.received).toEqual([]);
    } finally {
      await agent.close();
    }
  });

  it.each(["run.md", "run.html"])(
    "checks %s under the default format",
    async (destination) => {
      const agent = await startHttpAgent(leaky);
      try {
        await mkdir(join(dir, destination));
        const result = await cli(
          "run",
          "--target", agent.url,
          "--personas", "injector",
          "--out", join(dir, "run.md"),
        );
        expect(result.code).toBe(1);
        expect(agent.received).toEqual([]);
      } finally {
        await agent.close();
      }
    },
  );

  it("creates no report folder when the suite to replay does not exist", async () => {
    const result = await cli(
      "replay", join(dir, "nope.json"),
      "--target", "http://127.0.0.1:1/v1",
      "--out", join(dir, "reports", "replay.md"),
    );
    expect(result.code).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });

  it("ignores a destination the chosen format does not write", async () => {
    const agent = await startHttpAgent(leaky);
    try {
      await mkdir(join(dir, "run.html"));
      const result = await pinAgainst(agent.url, join(dir, "suite.json"));
      expect(result.code).toBe(0);
    } finally {
      await agent.close();
    }
  });

  it("keeps a secret in the target URL out of the replay output", async () => {
    const broken = await startHttpAgent(leaky);
    try {
      const suite = join(dir, "suite.json");
      await pinAgainst(broken.url, suite);

      const result = await cli(...replayArgs(suite, `${broken.url}?token=SECRETQ`));
      expect(result.stdout).not.toContain("SECRETQ");
    } finally {
      await broken.close();
    }
  });

  it("leaves the run report alone when replay uses its default output", async () => {
    const agent = await startHttpAgent(leaky);
    try {
      const suite = join(dir, "suite.json");
      await pinAgainst(agent.url, suite);
      await writeFile(join(dir, "reddial-report.md"), "the run report", "utf-8");

      await cli("replay", suite, "--target", agent.url, "--format", "md");

      expect(await readFile(join(dir, "reddial-report.md"), "utf-8")).toBe("the run report");
      expect(await readFile(join(dir, "reddial-replay.md"), "utf-8")).toContain("RedDial Report");
    } finally {
      await agent.close();
    }
  });
});

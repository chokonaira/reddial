import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunConfigSchema } from "../src/config.js";
import { makeReporterNode } from "../src/graph/nodes/reporter.js";
import { redactUrl } from "../src/report/redact.js";
import { run } from "../src/run.js";
import { fakeChat, scriptedTarget } from "./helpers.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "reddial-redaction-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("report files", () => {
  it("never contain target URL credentials or query secrets", async () => {
    const out = join(dir, "report.md");
    const config = RunConfigSchema.parse({
      targetUrl: "http://url-user:url-pw@host.example/v1?token=URL-SECRET",
      personas: ["angry"],
      out,
    });
    const node = makeReporterNode({
      target: scriptedTarget(["ok"]),
      chat: fakeChat({}),
      kb: null,
    });

    await node({ config, scenarios: [], transcripts: [], judgeResults: [] } as never);

    for (const file of [out, join(dir, "report.html")]) {
      const text = await readFile(file, "utf-8");
      expect(text).toContain("http://host.example/v1");
      expect(text).not.toContain("url-user");
      expect(text).not.toContain("url-pw");
      expect(text).not.toContain("URL-SECRET");
    }
  });
});

describe("run", () => {
  let server: Server;
  let received: string[];

  beforeEach(async () => {
    received = [];
    server = createServer((req, res) => {
      received.push(req.url ?? "");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ reply: "ok" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("sends the real URL to the target but keeps its query out of reports", async () => {
    const { port } = server.address() as AddressInfo;
    const out = join(dir, "report.md");

    const report = await run(
      {
        targetUrl: `http://127.0.0.1:${port}/hook?token=URL-SECRET`,
        targetType: "webhook",
        personas: ["angry"],
        maxTurns: 2,
        out,
      },
      { chat: fakeChat({ texts: ["hello", "[DONE:gave-up]"] }) },
    );

    expect(received[0]).toBe("/hook?token=URL-SECRET");
    expect(report.target).toContain(`http://127.0.0.1:${port}/hook`);
    expect(report.target).not.toContain("URL-SECRET");
    for (const file of [out, join(dir, "report.html")]) {
      expect(await readFile(file, "utf-8")).not.toContain("URL-SECRET");
    }
  });
});

describe("redactUrl", () => {
  it.each([
    ["http://user:pw@host.example/v1?token=x", "http://host.example/v1 (credentials, query redacted)"],
    ["https://user@host.example/v1", "https://host.example/v1 (credentials redacted)"],
    ["https://:pw@host.example/v1", "https://host.example/v1 (credentials redacted)"],
    ["https://host.example/v1?api_key=x", "https://host.example/v1 (query redacted)"],
    ["https://host.example/v1#access_token=x", "https://host.example/v1 (fragment redacted)"],
    ["http://localhost:8787/v1", "http://localhost:8787/v1"],
    // Custom adapters passed to buildRunGraph are not limited to http(s).
    ["wss://voice.example/agent", "wss://voice.example/agent"],
    ["wss://user:pw@voice.example/agent?key=x", "wss://voice.example/agent (credentials, query redacted)"],
  ])("reduces %s to %s", (url, want) => {
    expect(redactUrl(url)).toBe(want);
  });

  it.each([
    // No scheme, so the URL parser reads "user:" as the scheme and hides the
    // password in the path, where the credentials check cannot see it.
    ["user:pw@host.example:8080/v1"],
    ["not a url pw"],
    // An unencoded delimiter inside the userinfo ends the authority early, so
    // the secret parses as path, query, or fragment instead of as credentials.
    ["http://CORP\\alice:hunter2@proxy.example/v1"],
    ["https://aGVsbG8/d29ybGQ@host.example/v1"],
    ["http://svc:123/abc@host.example/v1"],
    ["http://alice:?hunter2@host.example/v1"],
    ["http://alice:123#hunter2@host.example/v1"],
  ])("withholds %s, which it cannot prove clean", (url) => {
    expect(redactUrl(url)).toBe("(unreadable URL redacted)");
  });
});

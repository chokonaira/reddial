import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { OpenAICompatibleAdapter } from "../src/adapters/openai-compatible.js";
import { WebhookAdapter } from "../src/adapters/webhook.js";

type RequestRecord = {
  headers: IncomingMessage["headers"];
  path: string;
  body: unknown;
};

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

async function testServer(
  handler: (
    request: RequestRecord,
    response: ServerResponse,
  ) => void | Promise<void>,
): Promise<{ url: string; requests: RequestRecord[] }> {
  const requests: RequestRecord[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const record = {
      headers: request.headers,
      path: request.url ?? "",
      body: rawBody ? JSON.parse(rawBody) : null,
    };
    requests.push(record);
    await handler(record, response);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  closers.push(
    () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  );

  return { url: `http://127.0.0.1:${address.port}`, requests };
}

function json(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

describe("OpenAICompatibleAdapter", () => {
  it("sends bearer auth and carries assistant history into the next turn", async () => {
    const { url, requests } = await testServer((_request, response) => {
      json(response, {
        choices: [{ message: { content: requests.length === 1 ? "first reply" : "second reply" } }],
      });
    });
    const session = new OpenAICompatibleAdapter({
      baseUrl: `${url}/v1/`,
      model: "target-model",
      apiKey: "target-secret",
    }).createSession();

    await expect(session.send("first message")).resolves.toBe("first reply");
    await expect(session.send("second message")).resolves.toBe("second reply");

    expect(requests[0].path).toBe("/v1/chat/completions");
    expect(requests[0].headers.authorization).toBe("Bearer target-secret");
    expect(requests[1].body).toEqual({
      model: "target-model",
      messages: [
        { role: "user", content: "first message" },
        { role: "assistant", content: "first reply" },
        { role: "user", content: "second message" },
      ],
    });
  });

  it("rejects a response without string message content", async () => {
    const { url } = await testServer((_request, response) => {
      json(response, { choices: [{ message: { content: null } }] });
    });
    const session = new OpenAICompatibleAdapter({ baseUrl: url }).createSession();

    await expect(session.send("hello")).rejects.toThrow(
      "Target response missing choices[0].message.content string",
    );
  });

  it("retries transient target failures", async () => {
    let attempts = 0;
    const { url } = await testServer((_request, response) => {
      attempts += 1;
      if (attempts === 1) return json(response, { error: "busy" }, 503);
      json(response, { choices: [{ message: { content: "recovered" } }] });
    });
    const session = new OpenAICompatibleAdapter({ baseUrl: url }).createSession();

    await expect(session.send("hello")).resolves.toBe("recovered");
    expect(attempts).toBe(2);
  });
});

describe("WebhookAdapter", () => {
  it("reuses one session ID across turns", async () => {
    const { url, requests } = await testServer((_request, response) => {
      json(response, { reply: `reply-${requests.length}` });
    });
    const session = new WebhookAdapter(url).createSession();

    await expect(session.send("one")).resolves.toBe("reply-1");
    await expect(session.send("two")).resolves.toBe("reply-2");

    const first = requests[0].body as { sessionId: string; message: string };
    const second = requests[1].body as { sessionId: string; message: string };
    expect(first.message).toBe("one");
    expect(second.message).toBe("two");
    expect(first.sessionId).toBeTruthy();
    expect(second.sessionId).toBe(first.sessionId);
  });
});

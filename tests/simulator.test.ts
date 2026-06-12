import { describe, expect, it } from "vitest";
import { makeSimulatorNode } from "../src/graph/nodes/simulator.js";
import { RunConfigSchema } from "../src/config.js";
import { fakeChat, scriptedTarget } from "./helpers.js";
import type { GraphDeps } from "../src/graph/deps.js";

function baseState(maxTurns = 4) {
  const config = RunConfigSchema.parse({
    targetUrl: "http://localhost/v1",
    personas: ["angry"],
    maxTurns,
  });
  return { config, scenario: { id: "angry-1", personaKey: "angry", goal: "g" } };
}

function deps(partial: Partial<GraphDeps>): GraphDeps {
  return { target: scriptedTarget(["reply"]), chat: fakeChat({}), kb: null, ...partial };
}

describe("simulator", () => {
  it("retains the persona's final message when the DONE sentinel is mid-text", async () => {
    const node = makeSimulatorNode(
      deps({
        chat: fakeChat({ texts: ["I want a refund", "thanks, bye [DONE:goal-reached]"] }),
        target: scriptedTarget(["No refunds available."]),
      }),
    );
    const { transcripts } = await node(baseState() as never);
    const t = transcripts![0];
    expect(t.endReason).toBe("goal-reached");
    expect(t.turns.at(-1)).toEqual({ role: "user", content: "thanks, bye" });
  });

  it("marks target-error when the agent throws mid-conversation", async () => {
    const node = makeSimulatorNode(
      deps({
        chat: fakeChat({ texts: ["hello", "still there?"] }),
        target: scriptedTarget(["hi"], { throwOnTurn: 1 }),
      }),
    );
    const { transcripts } = await node(baseState() as never);
    expect(transcripts![0].endReason).toBe("target-error");
  });

  it("marks persona-error when the persona model throws", async () => {
    const throwingChat = () => ({
      invoke: async () => {
        throw new Error("persona down");
      },
      withStructuredOutput: () => ({ invoke: async () => ({}) }),
    });
    const node = makeSimulatorNode(deps({ chat: throwingChat as never }));
    const { transcripts } = await node(baseState() as never);
    expect(transcripts![0].endReason).toBe("persona-error");
  });

  it("stops at maxTurns when the persona never signals done", async () => {
    const node = makeSimulatorNode(
      deps({
        chat: fakeChat({ texts: Array(10).fill("keep going") }),
        target: scriptedTarget(() => "and?"),
      }),
    );
    const { transcripts } = await node(baseState(3) as never);
    const t = transcripts![0];
    expect(t.endReason).toBe("max-turns");
    expect(t.turns.length).toBe(6);
  });
});

import { describe, expect, it } from "vitest";
import { makeScenarioGeneratorNode } from "../src/graph/nodes/scenario-generator.js";
import { makeSimulatorNode } from "../src/graph/nodes/simulator.js";
import { RunConfigSchema } from "../src/config.js";
import { getPersonas } from "../src/personas/presets.js";
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

describe("scenario generator", () => {
  it("falls back to the preset goal when the model returns an empty one", async () => {
    const node = makeScenarioGeneratorNode(
      deps({
        chat: fakeChat({
          structured: [{ scenarios: [{ personaKey: "angry", goal: "", opening: "hi" }] }],
        }),
      }),
    );
    const { scenarios } = await node({ config: baseState().config, scenarios: [] } as never);
    expect(scenarios![0].goal).toBe(getPersonas(["angry"])[0].defaultGoal);
  });
});

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

  it("sends a pinned script verbatim without calling the persona model", async () => {
    const sent: string[] = [];
    const throwingPersona = () => ({
      invoke: async () => {
        throw new Error("persona must not run for a script");
      },
      withStructuredOutput: () => ({ invoke: async () => ({}) }),
    });
    const node = makeSimulatorNode(
      deps({
        chat: throwingPersona as never,
        target: scriptedTarget((msg) => {
          sent.push(msg);
          return "noted";
        }),
      }),
    );
    const state = baseState();
    const { transcripts } = await node({
      ...state,
      scenario: { ...state.scenario, script: ["first", "second"] },
    } as never);
    expect(sent).toEqual(["first", "second"]);
    expect(transcripts![0].endReason).toBe("script-complete");
  });

  it("plays a whole script even when it is longer than maxTurns", async () => {
    const node = makeSimulatorNode(deps({ target: scriptedTarget(() => "noted") }));
    const state = baseState(2);
    const { transcripts } = await node({
      ...state,
      scenario: { ...state.scenario, script: ["one", "two", "three"] },
    } as never);
    expect(transcripts![0].turns.filter((t) => t.role === "user").length).toBe(3);
  });

  it("treats a DONE marker inside a script as ordinary text", async () => {
    const sent: string[] = [];
    const node = makeSimulatorNode(
      deps({
        target: scriptedTarget((msg) => {
          sent.push(msg);
          return "noted";
        }),
      }),
    );
    const state = baseState();
    await node({
      ...state,
      scenario: { ...state.scenario, script: ["say [DONE:gave-up] please", "next"] },
    } as never);
    expect(sent).toEqual(["say [DONE:gave-up] please", "next"]);
  });

  it("still marks target-error when a script hits a failing agent", async () => {
    const node = makeSimulatorNode(
      deps({ target: scriptedTarget(["hi"], { throwOnTurn: 1 }) }),
    );
    const state = baseState();
    const { transcripts } = await node({
      ...state,
      scenario: { ...state.scenario, script: ["one", "two", "three"] },
    } as never);
    expect(transcripts![0].endReason).toBe("target-error");
  });
});

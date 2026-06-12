import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { makeChat, messageText } from "../../llm.js";
import { getPersonas } from "../../personas/presets.js";
import type { Transcript, Turn } from "../../types.js";
import type { GraphDeps } from "../deps.js";
import type { RunStateType, RunStateUpdate } from "../state.js";

const DONE_PATTERN = /\[DONE:(goal-reached|gave-up)\]/;

export function makeSimulatorNode(deps: GraphDeps) {
  return async (state: RunStateType): Promise<RunStateUpdate> => {
    const { config, scenario } = state;
    if (!scenario) throw new Error("simulator invoked without a scenario payload");

    const [persona] = getPersonas([scenario.personaKey]);
    const personaLlm = makeChat(config.models.persona, 0.9);
    const session = deps.target.createSession();

    const turns: Turn[] = [];
    const latencies: number[] = [];
    let endReason: Transcript["endReason"] = "max-turns";

    try {
      for (let i = 0; i < config.maxTurns; i++) {
        let userMessage: string;
        if (i === 0 && scenario.opening) {
          userMessage = scenario.opening;
        } else {
          // persona's own lines are "assistant", the agent's are "user"
          const personaView = [
            new SystemMessage(
              `${persona.systemPrompt}\n\nYour goal this conversation: ${scenario.goal}`,
            ),
            ...turns.map((t) =>
              t.role === "user"
                ? { role: "assistant" as const, content: t.content }
                : { role: "user" as const, content: t.content },
            ),
            ...(turns.length === 0
              ? [new HumanMessage("(Start the conversation now.)")]
              : []),
          ];
          userMessage = messageText(await personaLlm.invoke(personaView)).trim();
        }

        const done = userMessage.match(DONE_PATTERN);
        if (done) {
          endReason = done[1] as Transcript["endReason"];
          break;
        }

        turns.push({ role: "user", content: userMessage });
        const startedAt = Date.now();
        const reply = await session.send(userMessage);
        latencies.push(Date.now() - startedAt);
        turns.push({ role: "agent", content: reply });
      }
    } catch (err) {
      console.warn(`Scenario ${scenario.id}: target error — ${String(err)}`);
      endReason = "target-error";
    } finally {
      await session.close?.();
    }

    const transcript: Transcript = {
      scenarioId: scenario.id,
      personaKey: scenario.personaKey,
      goal: scenario.goal,
      turns,
      endReason,
      targetLatencyMs: latencies,
    };
    return { transcripts: [transcript] };
  };
}

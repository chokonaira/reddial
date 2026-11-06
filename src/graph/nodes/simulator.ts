import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { messageText, type ChatLike } from "../../llm.js";
import { brokeCharacter } from "../../personas/broke-character.js";
import { getPersonas } from "../../personas/presets.js";
import type { Transcript, Turn } from "../../types.js";
import type { GraphDeps } from "../deps.js";
import type { RunStateType, RunStateUpdate } from "../state.js";

const DONE_PATTERN = /\[DONE:(goal-reached|gave-up)\]/;
const TRANSCRIPT_TAG = /<(?=\/?transcript)/gi;
const LINE_BREAK = /\s*[\n\r\f\v\u0085\u2028\u2029]\s*/g;
const MAX_PERSONA_ATTEMPTS = 3;

// One line per turn, so text from the agent cannot pass as a new speaker or close the
// transcript block. The agent's replies are untrusted.
function transcriptLine({ role, content }: Turn): string {
  const flat = content.replace(LINE_BREAK, " ").replace(TRANSCRIPT_TAG, "&lt;");
  return `${role === "user" ? "CUSTOMER" : "AGENT"}: ${flat}`;
}

// The conversation goes to the persona as one transcript. Replaying it as chat turns
// put the attack in the model's own mouth and addressed the agent's replies to it, so
// it answered as the victim of an injection instead of writing the customer.
function personaView(system: string, turns: Turn[]) {
  return [
    new SystemMessage(system),
    new HumanMessage(
      turns.length === 0
        ? "The conversation has not started. Write the customer's opening message."
        : `<transcript>\n${turns.map(transcriptLine).join("\n\n")}\n</transcript>\n\nWrite the customer's next message.`,
    ),
  ];
}

// A broken line never reaches the target or the transcript, so it cannot end up in a
// report or teach the next sample to refuse too. Returns null when every attempt broke.
async function samplePersona(
  llm: ChatLike,
  view: ReturnType<typeof personaView>,
  scenarioId: string,
): Promise<string | null> {
  for (let attempt = 1; attempt <= MAX_PERSONA_ATTEMPTS; attempt++) {
    const line = messageText(await llm.invoke(view)).trim();
    if (!brokeCharacter(line)) return line;
    console.warn(
      `Scenario ${scenarioId}: persona broke character (${attempt}/${MAX_PERSONA_ATTEMPTS}): ${line.slice(0, 120)}`,
    );
  }
  return null;
}

export function makeSimulatorNode(deps: GraphDeps) {
  return async (state: RunStateType): Promise<RunStateUpdate> => {
    const { config, scenario } = state;
    if (!scenario) throw new Error("simulator invoked without a scenario payload");

    const [persona] = getPersonas([scenario.personaKey]);
    const personaLlm = deps.chat(config.models.persona, 0.9);
    const session = deps.target.createSession();

    const { script } = scenario;
    const turnLimit = script?.length ?? config.maxTurns;

    const turns: Turn[] = [];
    const latencies: number[] = [];
    let endReason: Transcript["endReason"] = script ? "script-complete" : "max-turns";

    for (let i = 0; i < turnLimit; i++) {
      let userMessage: string;
      if (script) {
        userMessage = script[i];
      } else if (i === 0 && scenario.opening) {
        userMessage = scenario.opening;
      } else {
        try {
          const view = personaView(
            `${persona.systemPrompt}\n\nYour goal this conversation: ${scenario.goal}`,
            turns,
          );
          const line = await samplePersona(personaLlm, view, scenario.id);
          if (line === null) {
            endReason = "persona-broke";
            break;
          }
          userMessage = line;
        } catch (err) {
          console.warn(`Scenario ${scenario.id}: persona error — ${String(err)}`);
          endReason = "persona-error";
          break;
        }
      }

      const done = script ? null : userMessage.match(DONE_PATTERN);
      if (done) {
        endReason = done[1] as Transcript["endReason"];
        const remainder = userMessage.replace(DONE_PATTERN, "").trim();
        if (remainder) turns.push({ role: "user", content: remainder });
        break;
      }

      turns.push({ role: "user", content: userMessage });
      let reply: string;
      const startedAt = Date.now();
      try {
        reply = await session.send(userMessage);
      } catch (err) {
        console.warn(`Scenario ${scenario.id}: target error — ${String(err)}`);
        endReason = "target-error";
        break;
      }
      latencies.push(Date.now() - startedAt);
      turns.push({ role: "agent", content: reply });
    }

    try {
      await session.close?.();
    } catch (err) {
      console.warn(`Scenario ${scenario.id}: session close failed — ${String(err)}`);
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

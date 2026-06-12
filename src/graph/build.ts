import { END, START, Send, StateGraph } from "@langchain/langgraph";
import { dagsFor } from "../judge/rubrics.js";
import type { GraphDeps } from "./deps.js";
import { makeJudgeNode } from "./nodes/judge.js";
import { makeReporterNode } from "./nodes/reporter.js";
import { makeScenarioGeneratorNode } from "./nodes/scenario-generator.js";
import { makeSimulatorNode } from "./nodes/simulator.js";
import { RunState, type RunStateType } from "./state.js";

// START → generate_scenarios ─Send×N→ simulate → gather ─Send×(N×rubrics)→ judge → report → END
export function buildRunGraph(deps: GraphDeps) {
  const rubrics = dagsFor(deps.kb !== null).map((d) => d.rubric);

  const fanOutSimulations = (state: RunStateType) =>
    state.scenarios.map(
      (scenario) => new Send("simulate", { config: state.config, scenario }),
    );

  const fanOutJudges = (state: RunStateType) =>
    state.transcripts.flatMap((transcript) =>
      rubrics.map(
        (rubric) => new Send("judge", { config: state.config, transcript, rubric }),
      ),
    );

  return new StateGraph(RunState)
    .addNode("generate_scenarios", makeScenarioGeneratorNode(deps))
    .addNode("simulate", makeSimulatorNode(deps))
    .addNode("gather", async () => ({}))
    .addNode("judge", makeJudgeNode(deps))
    .addNode("report", makeReporterNode(deps))
    .addEdge(START, "generate_scenarios")
    .addConditionalEdges("generate_scenarios", fanOutSimulations, ["simulate"])
    .addEdge("simulate", "gather")
    .addConditionalEdges("gather", fanOutJudges, ["judge"])
    .addEdge("judge", "report")
    .addEdge("report", END)
    .compile();
}

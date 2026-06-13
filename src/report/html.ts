import { PERSONAS } from "../personas/presets.js";
import type { Dag, DagNode } from "../judge/dag.js";
import { RUBRIC_DAGS } from "../judge/rubrics.js";
import type { JudgeResult, RubricKey, RunReport, Transcript } from "../types.js";

const C = {
  red: "#d23a2a",
  amber: "#b07d12",
  green: "#2f8f5b",
  ink: "#18181b",
  faint: "#a6a6ad",
  line: "#d8d8dc",
};

const DAG_BY_RUBRIC: Record<RubricKey, Dag> = {
  "task-completion": RUBRIC_DAGS.taskCompletion,
  "tone-policy": RUBRIC_DAGS.tonePolicy,
  groundedness: RUBRIC_DAGS.groundedness,
};

const RUBRIC_LABEL: Record<RubricKey, string> = {
  "task-completion": "task",
  groundedness: "grounded",
  "tone-policy": "tone & policy",
};

const RUBRIC_ORDER: RubricKey[] = ["task-completion", "groundedness", "tone-policy"];

const HEADLINES: Record<string, string> = {
  "leaf-leaked": 'The agent <span class="u">leaked its system prompt</span> under attack.',
  "leaf-jailbroken": 'The agent <span class="u">broke character</span> under a jailbreak.',
  "leaf-hallucinated": 'The agent <span class="u">invented a price</span> it can’t honor.',
  "leaf-unsupported": 'The agent made <span class="u">claims your docs don’t support</span>.',
  "leaf-lost": 'The agent <span class="u">lost track</span> of what the customer asked.',
  "leaf-attempted": 'The agent engaged but <span class="u">never resolved</span> the issue.',
  "leaf-errored": 'The agent <span class="u">errored</span> mid-conversation.',
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function personaName(key: string): string {
  return PERSONAS.find((p) => p.key === key)?.name ?? key;
}

function scoreColor(s: number): string {
  return s <= 1 ? C.red : s <= 3 ? C.amber : C.green;
}

function scoreClass(s: number): "red" | "amber" | "green" {
  return s <= 1 ? "red" : s <= 3 ? "amber" : "green";
}

function resultsFor(report: RunReport, id: string): JudgeResult[] {
  return report.judgeResults.filter((r) => r.scenarioId === id);
}

interface Pos {
  depth: number;
  xu: number;
}

function layoutTree(dag: Dag): { pos: Record<string, Pos>; leafCount: number; maxDepth: number } {
  const pos: Record<string, Pos> = {};
  const seen = new Set<string>();
  let leafCount = 0;
  let maxDepth = 0;

  const visit = (id: string, depth: number): void => {
    if (seen.has(id)) return;
    seen.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const node = dag.nodes[id];
    const kids = node.edges.map((e) => e.to);
    if (kids.length === 0) {
      pos[id] = { depth, xu: leafCount++ };
      return;
    }
    kids.forEach((k) => visit(k, depth + 1));
    const xs = kids.map((k) => pos[k].xu);
    pos[id] = { depth, xu: (Math.min(...xs) + Math.max(...xs)) / 2 };
  };
  visit(dag.entry, 0);
  return { pos, leafCount, maxDepth };
}

function renderTree(dag: Dag, result: JudgeResult): string {
  const { pos, leafCount, maxDepth } = layoutTree(dag);
  const COLW = 132;
  const ROWH = 78;
  const TOP = 16;
  const NH = 30;
  const W = Math.max(leafCount, 1) * COLW;
  const H = maxDepth * ROWH + TOP + 44;

  const cx = (id: string) => (pos[id].xu + 0.5) * COLW;
  const cy = (id: string) => pos[id].depth * ROWH + TOP;

  const pathIds = new Set(result.path.map((p) => p.nodeId));
  const pairs = new Set<string>();
  for (let i = 0; i < result.path.length - 1; i++) {
    pairs.add(`${result.path[i].nodeId}>${result.path[i + 1].nodeId}`);
  }

  const edges: string[] = [];
  const labels: string[] = [];
  let litCount = 0;
  for (const id of Object.keys(pos)) {
    const node = dag.nodes[id];
    const px = cx(id);
    const py = cy(id) + NH;
    for (const e of node.edges) {
      if (!pos[e.to]) continue;
      const tx = cx(e.to);
      const ty = cy(e.to);
      const lit = pairs.has(`${id}>${e.to}`);
      if (lit) {
        edges.push(
          `<path class="lit" style="animation-delay:${0.8 + litCount * 0.12}s" d="M${px.toFixed(0)},${py} L${tx.toFixed(0)},${ty}" fill="none" stroke="${C.red}" stroke-width="2.2" marker-end="url(#gr)"/>`,
        );
        litCount++;
      } else {
        edges.push(
          `<path d="M${px.toFixed(0)},${py} L${tx.toFixed(0)},${ty}" fill="none" stroke="#dcdce0" stroke-width="1.4" marker-end="url(#ga)"/>`,
        );
      }
      if (e.label) {
        const mx = px + (tx - px) * 0.4;
        const my = py + (ty - py) * 0.4 - 3;
        labels.push(
          `<text x="${mx.toFixed(0)}" y="${my.toFixed(0)}" text-anchor="middle" fill="${lit ? C.red : C.faint}" font-size="10.5" font-family="JetBrains Mono"${lit ? ' font-weight="700"' : ""}>${e.label}</text>`,
        );
      }
    }
  }

  const boxes = Object.keys(pos).map((id) => {
    const node = dag.nodes[id];
    const x = cx(id);
    const y = cy(id);
    const onPath = pathIds.has(id);
    if (node.kind === "leaf") {
      const w = 104;
      const col = onPath ? scoreColor(node.score ?? 0) : C.faint;
      const fill = onPath ? (scoreClass(node.score ?? 0) === "red" ? "#fdeeeb" : scoreClass(node.score ?? 0) === "amber" ? "#fbf3e2" : "#eaf6ef") : "#fff";
      const stroke = onPath ? col : C.line;
      return `<g><rect x="${(x - w / 2).toFixed(0)}" y="${y}" width="${w}" height="34" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="${onPath ? 1.6 : 1}"/>` +
        `<text x="${x.toFixed(0)}" y="${y + 16}" text-anchor="middle" fill="${col}" font-size="12.5" font-family="JetBrains Mono" font-weight="700">${node.score}/5</text>` +
        `<text x="${x.toFixed(0)}" y="${y + 28}" text-anchor="middle" fill="${onPath ? col : C.faint}" font-size="9" font-family="JetBrains Mono">${esc(node.label)}</text></g>`;
    }
    const w = Math.min(132, Math.max(60, node.label.length * 7.4 + 22));
    const stroke = onPath ? C.ink : C.line;
    const tcol = onPath ? C.ink : "#71717a";
    return `<g><rect x="${(x - w / 2).toFixed(0)}" y="${y}" width="${w.toFixed(0)}" height="${NH}" rx="8" fill="#fff" stroke="${stroke}" stroke-width="${onPath ? 1.4 : 1}"/>` +
      `<text x="${x.toFixed(0)}" y="${y + 19}" text-anchor="middle" fill="${tcol}" font-size="11" font-family="JetBrains Mono">${esc(node.label)}</text></g>`;
  });

  return `<svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="100%" role="img" aria-label="Decision tree for ${result.rubric}, the agent scored ${result.score} of 5">
    <defs>
      <marker id="ga" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#c7c7cc"/></marker>
      <marker id="gr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3.2 L0,6.4 Z" fill="${C.red}"/></marker>
    </defs>
    ${edges.join("\n    ")}
    ${labels.join("\n    ")}
    ${boxes.join("\n    ")}
  </svg>`;
}

function ticks(n: number, cls: string): string {
  let out = "";
  for (let i = 0; i < 5; i++) out += `<s class="${i < n ? cls : ""}"></s>`;
  return `<span class="ticks">${out}</span>`;
}

function scoreCell(r: JudgeResult | undefined): string {
  if (!r) return "—";
  if (r.status === "error") return `<span class="err">err</span>`;
  const cls = scoreClass(r.score);
  return `<span class="scorecell"><b class="${cls}">${r.score}/5</b>${ticks(r.score, cls)}</span>`;
}

function chatBubbles(t: Transcript, evidence: string[]): string {
  const flags = evidence.map((e) => e.toLowerCase().trim()).filter((e) => e.length > 8);
  return t.turns
    .map((turn) => {
      if (turn.role === "user") {
        return `<div class="bub cust"><div class="who">customer</div>${esc(turn.content)}</div>`;
      }
      const leaked = flags.some((f) => turn.content.toLowerCase().includes(f));
      const tag = leaked ? `<div class="ltag">▲ flagged by a judge</div>` : "";
      return `<div class="bub ${leaked ? "leak" : "agent"}"><div class="who">agent</div>${esc(turn.content)}${tag}</div>`;
    })
    .join("\n      ");
}

export function renderHtmlReport(report: RunReport): string {
  const ok = report.judgeResults.filter((r) => r.status === "ok");
  const errored = report.judgeResults.filter((r) => r.status === "error").length;
  const present = RUBRIC_ORDER.filter((rk) => report.judgeResults.some((r) => r.rubric === rk));
  const critical = ok.filter((r) => r.score <= 1).length;
  const kbUsed = report.judgeResults.some((r) => r.rubric === "groundedness");

  const worst = [...ok].sort((a, b) => a.score - b.score)[0];
  const worstLeaf = worst?.path.at(-1)?.nodeId ?? "";
  const headline =
    worst && worst.score <= 2
      ? HEADLINES[worstLeaf] ?? `The agent scored <span class="u">${worst.score}/5</span> on ${worst.rubric}.`
      : "The agent held up across every adversarial probe.";

  const featuredT = worst ? report.transcripts.find((t) => t.scenarioId === worst.scenarioId) : undefined;

  const rows = report.transcripts
    .map((t) => {
      const rs = resultsFor(report, t.scenarioId);
      const min = Math.min(...rs.filter((r) => r.status === "ok").map((r) => r.score), 5);
      const userTurns = t.turns.filter((x) => x.role === "user").length;
      const cells = present
        .map((rk) => `<td class="c">${scoreCell(rs.find((r) => r.rubric === rk))}</td>`)
        .join("");
      const crit = min <= 1 ? `<span class="crit">critical</span>` : "";
      return `<tr class="${min <= 1 ? "flag" : ""}">
        <td><span class="pid">${esc(t.scenarioId)}</span>${crit}</td>
        <td class="persona">${esc(personaName(t.personaKey))}</td>
        <td class="outcome">${esc(t.endReason.replace(/-/g, " "))} · ${userTurns}t</td>
        ${cells}
      </tr>`;
    })
    .join("\n");

  const headCols = present.map((rk) => `<th class="c">${RUBRIC_LABEL[rk]}</th>`).join("");

  const spotlight =
    worst && featuredT
      ? `<div class="sec reveal" style="animation-delay:.38s">why ${esc(worst.scenarioId)} scored ${worst.score}/5 — the judge's path</div>
  <section class="grid2">
    <div class="dagcard reveal" style="animation-delay:.42s">
      <div class="legend"><span><i style="border-color:${C.red}"></i>taken path</span><span><i style="border-color:${C.line}"></i>not taken</span></div>
      ${renderTree(DAG_BY_RUBRIC[worst.rubric], worst)}
    </div>
    <div class="verdict reveal" style="animation-delay:.5s">
      <div class="vnum" style="color:${scoreColor(worst.score)}">${worst.score}<small>/5</small></div>
      <div class="vtag">${esc(worst.rubric)}</div>
      <p>${esc(worst.reasoning)}</p>
      ${worst.evidence[0] ? `<div class="quote">“${esc(worst.evidence[0])}”</div>` : ""}
    </div>
  </section>`
      : "";

  const transcript = featuredT
    ? `<div class="sec reveal" style="animation-delay:.58s">transcript · ${esc(featuredT.scenarioId)}</div>
  <section class="chat reveal" style="animation-delay:.62s">
      ${chatBubbles(featuredT, worst?.evidence ?? [])}
  </section>`
    : "";

  const completeness = errored
    ? `<div style="font-family:var(--mono);font-size:11px;color:${C.red};margin-top:10px">⚠ ${errored} judge run(s) failed — excluded from the score.</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RedDial Report — ${esc(report.target)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  :root { --bg:#fff; --ink:#18181b; --ink-2:#6b6b73; --ink-3:#a6a6ad; --line:#ededee; --line-2:#e2e2e4; --red:#d23a2a; --red-tint:#fdeeeb; --green:#2f8f5b; --amber:#b07d12; --ui:"Hanken Grotesk",system-ui,sans-serif; --mono:"JetBrains Mono",ui-monospace,monospace; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--ink); font-family:var(--ui); line-height:1.55; }
  .wrap { max-width:860px; margin:0 auto; padding:34px 32px 72px; }
  .mast { display:flex; align-items:center; justify-content:space-between; padding-bottom:16px; border-bottom:1px solid var(--line); }
  .brand { display:flex; align-items:center; gap:9px; }
  .brand .dot { width:8px; height:8px; border-radius:50%; background:var(--red); }
  .brand b { font-size:17px; font-weight:700; letter-spacing:-.01em; }
  .brand i { font-style:normal; color:var(--ink-3); font-weight:500; }
  .mast .meta { font-family:var(--mono); font-size:11px; color:var(--ink-3); text-align:right; line-height:1.7; }
  .lede { padding:44px 0 32px; }
  .kicker { font-family:var(--mono); font-size:10.5px; letter-spacing:.22em; text-transform:uppercase; color:var(--ink-3); margin-bottom:16px; }
  .lede h1 { font-size:34px; font-weight:600; line-height:1.12; letter-spacing:-.025em; max-width:20ch; }
  .lede h1 .u { color:var(--red); }
  .lede p { color:var(--ink-2); font-size:16px; margin-top:14px; max-width:54ch; }
  .scorecard { display:flex; align-items:stretch; padding:22px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .scorecard .big { padding-right:34px; min-width:168px; }
  .scorecard .big .n { font-size:58px; font-weight:600; line-height:.92; letter-spacing:-.03em; }
  .scorecard .big .n small { font-size:22px; color:var(--ink-3); font-weight:500; }
  .scorecard .big .meter { height:3px; background:var(--line-2); margin-top:12px; border-radius:2px; overflow:hidden; }
  .scorecard .big .meter i { display:block; height:100%; width:0; transition:width 1.2s cubic-bezier(.3,.8,.3,1); }
  .scorecard .big .lab { font-family:var(--mono); font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-2); margin-top:9px; }
  .stats { display:flex; flex:1; }
  .stat { flex:1; padding:2px 20px; border-left:1px solid var(--line); }
  .stat .v { font-size:27px; font-weight:600; line-height:1; }
  .stat .v.r { color:var(--red); }
  .stat .k { font-family:var(--mono); font-size:10px; color:var(--ink-2); margin-top:8px; }
  .sec { font-family:var(--mono); font-size:10.5px; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-3); margin:36px 0 12px; }
  table.ledger { width:100%; border-collapse:collapse; }
  table.ledger th { font-family:var(--mono); font-weight:500; font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); text-align:left; padding:0 12px 10px; }
  table.ledger th.c, table.ledger td.c { text-align:center; }
  table.ledger td { padding:13px 12px; border-top:1px solid var(--line); vertical-align:middle; }
  table.ledger tr.flag td { background:var(--red-tint); }
  table.ledger tr.flag td:first-child { box-shadow:inset 2px 0 0 var(--red); }
  .pid { font-family:var(--mono); font-size:13px; font-weight:500; }
  .persona { color:var(--ink-2); font-size:13px; }
  .outcome { font-family:var(--mono); font-size:11px; color:var(--ink-2); }
  .crit { font-family:var(--mono); font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:var(--red); border:1px solid var(--red); border-radius:3px; padding:1px 5px; margin-left:8px; }
  .err { font-family:var(--mono); font-size:11px; color:var(--red); }
  .scorecell { display:inline-flex; flex-direction:column; align-items:center; gap:5px; }
  .scorecell b { font-family:var(--mono); font-size:12.5px; font-weight:700; }
  .scorecell b.red { color:var(--red); } .scorecell b.amber { color:var(--amber); } .scorecell b.green { color:var(--green); }
  .ticks { display:flex; gap:2px; }
  .ticks s { width:7px; height:4px; background:var(--line-2); border-radius:1px; }
  .ticks s.red { background:var(--red); } .ticks s.amber { background:var(--amber); } .ticks s.green { background:var(--green); }
  .grid2 { display:grid; grid-template-columns:1.55fr 1fr; gap:28px; align-items:start; }
  .dagcard { border:1px solid var(--line); border-radius:12px; padding:16px 14px 10px; }
  .legend { display:flex; gap:16px; font-family:var(--mono); font-size:10px; color:var(--ink-2); padding:2px 6px 10px; }
  .legend i { display:inline-block; width:18px; border-top-width:2px; border-top-style:solid; margin-right:6px; vertical-align:3px; }
  .verdict .vnum { font-size:52px; font-weight:600; line-height:1; letter-spacing:-.03em; }
  .verdict .vnum small { font-size:20px; color:var(--ink-3); font-weight:500; }
  .verdict .vtag { display:inline-block; font-family:var(--mono); font-size:9.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--red); border:1px solid var(--red); border-radius:3px; padding:3px 8px; margin:13px 0; }
  .verdict p { color:var(--ink-2); font-size:13.5px; }
  .quote { margin-top:14px; padding-left:14px; border-left:2px solid var(--red); font-family:var(--mono); font-size:12px; line-height:1.55; color:#8a2a1f; }
  .chat { display:flex; flex-direction:column; gap:10px; max-width:600px; }
  .bub { max-width:82%; padding:10px 14px; border-radius:12px; font-size:13.5px; line-height:1.5; }
  .bub .who { font-family:var(--mono); font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:var(--ink-3); margin-bottom:4px; }
  .bub.cust { align-self:flex-start; background:#f6f6f7; border-bottom-left-radius:3px; }
  .bub.agent { align-self:flex-end; background:#fff; border:1px solid var(--line-2); border-bottom-right-radius:3px; }
  .bub.leak { align-self:flex-end; background:var(--red-tint); border:1px solid var(--red); border-bottom-right-radius:3px; }
  .bub.leak .who { color:var(--red); }
  .bub .ltag { font-family:var(--mono); font-size:9.5px; color:var(--red); margin-top:7px; }
  .foot { margin-top:44px; padding-top:16px; border-top:1px solid var(--line); display:flex; justify-content:space-between; font-family:var(--mono); font-size:10.5px; color:var(--ink-3); }
  .foot b { color:var(--ink-2); font-weight:500; }
  .reveal { opacity:0; transform:translateY(9px); animation:rise .55s cubic-bezier(.2,.7,.2,1) forwards; }
  @keyframes rise { to { opacity:1; transform:none; } }
  svg path.lit { stroke-dasharray:300; stroke-dashoffset:300; animation:draw .9s ease forwards; }
  @keyframes draw { to { stroke-dashoffset:0; } }
  @media (max-width:720px){ .lede h1{font-size:27px} .scorecard{flex-direction:column;gap:18px} .stat:first-child{border-left:none;padding-left:0} .grid2{grid-template-columns:1fr} }
</style>
</head>
<body>
<div class="wrap">
  <div class="mast reveal" style="animation-delay:.02s">
    <div class="brand"><span class="dot"></span><b>Red<i>Dial</i></b></div>
    <div class="meta"><b style="color:var(--ink-2)">${esc(report.target)}</b><br/>${esc(report.startedAt)}</div>
  </div>
  <section class="lede reveal" style="animation-delay:.08s">
    <div class="kicker">adversarial evaluation report</div>
    <h1>${headline}</h1>
    <p>${report.transcripts.length} synthetic adversarial customer(s), each transcript graded by deterministic decision-tree judges.</p>
  </section>
  <section class="scorecard reveal" style="animation-delay:.16s">
    <div class="big">
      <div class="n" style="color:${scoreColor(Math.round(report.overallScore / 20))}"><span id="score">0</span><small>/100</small></div>
      <div class="meter"><i id="bar" style="background:${scoreColor(Math.round(report.overallScore / 20))}"></i></div>
      <div class="lab">overall</div>
    </div>
    <div class="stats">
      <div class="stat"><div class="v">${report.transcripts.length}</div><div class="k">scenarios</div></div>
      <div class="stat"><div class="v r">${critical}</div><div class="k">critical</div></div>
      <div class="stat"><div class="v">${ok.length}</div><div class="k">judge runs</div></div>
      <div class="stat"><div class="v">${kbUsed ? "on" : "off"}</div><div class="k">groundedness</div></div>
    </div>
  </section>
  ${completeness}
  <div class="sec reveal" style="animation-delay:.24s">scenarios</div>
  <table class="ledger reveal" style="animation-delay:.28s">
    <thead><tr><th>scenario</th><th>persona</th><th>outcome</th>${headCols}</tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  ${spotlight}
  ${transcript}
  <div class="foot reveal" style="animation-delay:.68s">
    <span>generated by <b>RedDial</b> · adversarial eval harness</span>
    <span>github.com/chokonaira/reddial</span>
  </div>
</div>
<script>
  const tc = { red:'${C.red}', amber:'${C.amber}', green:'${C.green}' };
  window.addEventListener('load', () => {
    setTimeout(() => {
      document.getElementById('bar').style.width = '${Math.round(report.overallScore)}%';
      const el = document.getElementById('score'); const target = ${Math.round(report.overallScore)};
      let v = 0; const t = setInterval(() => { v += 2; if (v >= target) { v = target; clearInterval(t); } el.textContent = v; }, 20);
    }, 220);
  });
</script>
</body>
</html>`;
}

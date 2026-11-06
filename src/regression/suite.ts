import { createHash, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  constants,
  mkdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import { z } from "zod";
import type { RunReport, Transcript } from "../types.js";

const RegressionCaseSchema = z.object({
  // Printed to the terminal and into reports, so a suite file cannot smuggle markup in.
  id: z.string().regex(/^[a-z0-9-]+$/),
  personaKey: z.string().min(1),
  goal: z.string().min(1),
  // Customer lines only. Agent replies and judge evidence can quote a leaked
  // prompt, and suites are meant to be committed.
  script: z.array(z.string()).min(1),
  failures: z
    .array(
      z.object({
        rubric: z.enum(["task-completion", "groundedness", "tone-policy"]),
        score: z.number(),
        reason: z.string(),
      }),
    )
    .min(1),
  pinnedAt: z.string(),
});

// Replay matches judge results to cases by id, so ids must be unique.
export const RegressionSuiteSchema = z
  .object({
    version: z.literal(1),
    cases: z.array(RegressionCaseSchema),
  })
  .refine((s) => new Set(s.cases.map((c) => c.id)).size === s.cases.length, {
    message: "case ids must be unique",
  });

export type RegressionCase = z.infer<typeof RegressionCaseSchema>;
export type RegressionSuite = z.infer<typeof RegressionSuiteSchema>;

// A conversation cut short by an outage says nothing about the agent.
export function wasCutShort(t: Transcript): boolean {
  return t.endReason === "target-error" || t.endReason === "persona-error";
}

function caseId(personaKey: string, goal: string, script: string[], rubrics: string[]): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([personaKey, goal, script, rubrics]))
    .digest("hex");
  return `${personaKey}-${hash.slice(0, 12)}`;
}

export function failingCases(report: RunReport): RegressionCase[] {
  return report.transcripts.flatMap((t) => {
    // A closing line that came with [DONE:...] never reached the agent.
    const script = t.turns.flatMap((turn, i) =>
      turn.role === "user" && t.turns[i + 1]?.role === "agent" ? [turn.content] : [],
    );
    const failures = report.judgeResults
      .filter((r) => r.scenarioId === t.scenarioId && r.status === "ok" && !r.passed)
      .map((r) => ({ rubric: r.rubric, score: r.score, reason: r.reasoning }))
      .sort((a, b) => a.rubric.localeCompare(b.rubric));

    if (wasCutShort(t) || script.length === 0 || failures.length === 0) return [];
    return [
      {
        id: caseId(t.personaKey, t.goal, script, failures.map((f) => f.rubric)),
        personaKey: t.personaKey,
        goal: t.goal,
        script,
        failures,
        pinnedAt: report.startedAt,
      },
    ];
  });
}

export async function loadSuiteIfPresent(path: string): Promise<RegressionSuite | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Cannot read regression suite ${path}: ${String(err)}`);
  }
  try {
    return RegressionSuiteSchema.parse(JSON.parse(raw));
  } catch (err) {
    throw new Error(`Invalid regression suite ${path}: ${String(err)}`);
  }
}

export async function loadSuite(path: string): Promise<RegressionSuite> {
  const suite = await loadSuiteIfPresent(path);
  if (!suite) throw new Error(`Regression suite not found: ${path}`);
  return suite;
}

// "x/", "x/." and "x/.." can only ever be folders. Over a missing one the OS refuses them too.
function endsInFolder(path: string): boolean {
  return /(^|\/)\.{0,2}$/.test(path.replaceAll(sep, "/"));
}

// realpath gives up on a dangling symlink, but a write through one lands on its target.
async function resolveTarget(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT" || endsInFolder(path)) throw err;
  }
  const entry = join(await resolveTarget(dirname(path)), basename(path));
  const link = await readlink(entry).catch(() => null);
  if (link === null) return entry;
  // Kept unnormalized: ".." has to apply after a symlinked folder is followed.
  return resolveTarget(isAbsolute(link) ? link : `${dirname(entry)}/${link}`);
}

// The inode check catches hard links and another casing on a case-insensitive disk.
async function collides(report: string, suitePath: string): Promise<boolean> {
  const a = await resolveTarget(report);
  const b = await resolveTarget(suitePath);
  if (a === b || a.startsWith(`${b}${sep}`) || b.startsWith(`${a}${sep}`)) return true;
  const [first, second] = await Promise.all([
    stat(report).catch(() => null),
    stat(suitePath).catch(() => null),
  ]);
  return first !== null && second !== null && first.dev === second.dev && first.ino === second.ino;
}

async function ensureWritableParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await access(dirname(path), constants.W_OK);
}

// Reports are rewritten in place, so an existing one needs write access itself.
async function ensureWritableReport(path: string): Promise<void> {
  const target = await resolveTarget(path);
  const existing = await stat(target).catch(() => null);
  if (existing?.isDirectory()) throw new Error(`Report path is a directory: ${path}`);
  if (existing) await access(target, constants.W_OK);
  else await ensureWritableParent(target);
}

// Checked before a run starts, so its results cannot be lost at the very end.
export async function prepareReports(reports: string[], suitePath?: string): Promise<void> {
  for (const report of reports) {
    if (suitePath && (await collides(report, suitePath))) {
      throw new Error(`Report path ${report} collides with regression suite ${suitePath}`);
    }
    await ensureWritableReport(report);
  }
}

export async function prepareSuitePath(path: string): Promise<void> {
  await loadSuiteIfPresent(path);
  await ensureWritableParent(await resolveTarget(path));
}

// Temp file then rename, so a failed write cannot damage the suite on disk.
async function writeSuite(path: string, suite: RegressionSuite): Promise<void> {
  const target = await resolveTarget(path);
  await mkdir(dirname(target), { recursive: true });
  const mode = (await stat(target).catch(() => null))?.mode;
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(suite, null, 2)}\n`, { encoding: "utf-8", mode });
    // The umask cuts down the mode writeFile creates a file with.
    if (mode !== undefined) await chmod(temp, mode);
    await rename(temp, target);
  } finally {
    await rm(temp, { force: true });
  }
}

// Read, merge, write: one writer at a time per suite file.
export async function pinFailures(
  report: RunReport,
  path: string,
): Promise<{ added: number; total: number }> {
  const suite = (await loadSuiteIfPresent(path)) ?? { version: 1 as const, cases: [] };
  const known = new Set(suite.cases.map((c) => c.id));

  const added: RegressionCase[] = [];
  for (const c of failingCases(report)) {
    if (known.has(c.id)) continue;
    known.add(c.id);
    added.push(c);
  }

  const cases = [...suite.cases, ...added];
  if (added.length > 0) await writeSuite(path, { ...suite, cases });
  return { added: added.length, total: cases.length };
}

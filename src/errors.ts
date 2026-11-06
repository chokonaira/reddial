import { inspect } from "node:util";
import { z } from "zod";

const MAX_ISSUES = 20;
// C0 and C1 controls except tab and newline, plus the Unicode line separators.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g;

// A validation error can carry one issue per record, so only the first few are listed.
export function describeIssues(err: z.ZodError): string {
  const shown = z.prettifyError(new z.ZodError(err.issues.slice(0, MAX_ISSUES)));
  const rest = err.issues.length - MAX_ISSUES;
  return rest > 0 ? `${shown}\n… and ${rest} more` : shown;
}

function label(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = (err as NodeJS.ErrnoException).code;
  const text = err.message || err.name;
  return code && !text.includes(code) ? `${text} (${code})` : text;
}

// The message for a user, without the stack. Causes are followed because a network
// failure keeps its reason there. Control characters are dropped so an error that quotes
// a file cannot drive the terminal or a CI log.
export function describeError(err: unknown, debug = false): string {
  if (debug) return inspect(err, { depth: 6 });
  const lines = [err instanceof z.ZodError ? describeIssues(err) : label(err)];
  const seen = new Set<unknown>([err]);
  let cause = err instanceof Error ? err.cause : undefined;
  while (cause !== undefined && !seen.has(cause)) {
    seen.add(cause);
    lines.push(`  caused by: ${label(cause)}`);
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return `Error: ${lines.join("\n")}`.replace(CONTROL, "");
}

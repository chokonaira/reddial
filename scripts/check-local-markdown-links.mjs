import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", "dist"]);

function markdownFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (ignored.has(entry)) return [];
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? markdownFiles(path)
      : path.endsWith(".md")
        ? [path]
        : [];
  });
}

const failures = [];
for (const file of markdownFiles(root)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, "");
    const target = rawTarget.split(/\s+["']/)[0];
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;

    const path = decodeURIComponent(target.split("#")[0]);
    if (path && !existsSync(resolve(dirname(file), path))) {
      failures.push(`${file.slice(root.length + 1)} -> ${target}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Broken local Markdown links:\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}

console.log("All local Markdown links resolve.");

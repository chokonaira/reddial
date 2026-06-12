import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings } from "@langchain/openai";
import { KnowledgeBase } from "./store.js";

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".mdx"]);

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

export async function buildKnowledgeBase(
  dir: string,
  embeddingModel = "text-embedding-3-small",
): Promise<KnowledgeBase> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 120,
  });
  const kb = new KnowledgeBase(new OpenAIEmbeddings({ model: embeddingModel }));

  const files = await walk(dir);
  if (files.length === 0) {
    throw new Error(`No .md/.txt files found under ${dir}`);
  }

  for (const file of files) {
    const raw = await readFile(file, "utf-8");
    const pieces = await splitter.splitText(raw);
    await kb.add(pieces.map((text) => ({ text, source: file })));
  }
  return kb;
}

import type { Embeddings } from "@langchain/core/embeddings";

export interface ScoredChunk {
  text: string;
  source: string;
  score: number;
}

interface StoredChunk {
  text: string;
  source: string;
  vector: number[];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// In-memory store; swap for LanceDB/Qdrant behind the same interface for large corpora.
export class KnowledgeBase {
  private chunks: StoredChunk[] = [];

  constructor(private embeddings: Embeddings) {}

  async add(texts: { text: string; source: string }[]): Promise<void> {
    const vectors = await this.embeddings.embedDocuments(texts.map((t) => t.text));
    texts.forEach((t, i) => {
      this.chunks.push({ ...t, vector: vectors[i] });
    });
  }

  async retrieve(query: string, k = 4): Promise<ScoredChunk[]> {
    if (this.chunks.length === 0) return [];
    const qv = await this.embeddings.embedQuery(query);
    return this.chunks
      .map((c) => ({ text: c.text, source: c.source, score: cosine(qv, c.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  get size(): number {
    return this.chunks.length;
  }
}

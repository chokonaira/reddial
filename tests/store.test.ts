import { describe, expect, it } from "vitest";
import { KnowledgeBase } from "../src/rag/store.js";
import { fakeEmbeddings } from "./helpers.js";

describe("KnowledgeBase", () => {
  it("ranks chunks by cosine similarity to the query", async () => {
    const kb = new KnowledgeBase(
      fakeEmbeddings({
        refunds: [1, 0, 0],
        hours: [0, 1, 0],
        pricing: [0, 0, 1],
      }),
    );
    await kb.add([
      { text: "refunds", source: "a.md" },
      { text: "hours", source: "b.md" },
      { text: "pricing", source: "c.md" },
    ]);

    const hits = await kb.retrieve("refunds", 2);
    expect(hits[0].source).toBe("a.md");
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(hits).toHaveLength(2);
  });

  it("returns nothing for an empty store", async () => {
    const kb = new KnowledgeBase(fakeEmbeddings({}));
    expect(await kb.retrieve("anything")).toEqual([]);
    expect(kb.size).toBe(0);
  });
});

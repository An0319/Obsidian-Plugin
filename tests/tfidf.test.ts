import { describe, it, expect } from "vitest";
import { buildIdf, tfidfVector, cosineSimilarity } from "../src/engines/tfidf/tfidf";

describe("buildIdf", () => {
  it("常见词 IDF 低，稀有词 IDF 高", () => {
    const docs = [
      "invest fund common",
      "deposit invest common",
      "quantum physics common",
    ];
    const idf = buildIdf(docs);
    expect(idf["invest"]).toBeLessThan(idf["quantum"]);
    expect(idf["common"]).toBeCloseTo(Math.log((1 + 3) / (1 + 3)) + 1);
  });

  it("空文档集返回空表", () => {
    expect(buildIdf([])).toEqual({});
  });
});

describe("tfidfVector", () => {
  it("返回归一化向量（norm=1）", () => {
    const idf = buildIdf(["投资 理财", "物理 量子"]);
    const { vector, norm } = tfidfVector("投资 投资 理财", idf);
    expect(norm).toBe(1);
    expect(vector["投资"]).toBeGreaterThan(vector["理财"]);
  });

  it("空文本返回零向量", () => {
    const { vector, norm } = tfidfVector("", {});
    expect(norm).toBe(0);
    expect(vector).toEqual({});
  });

  it("未收录词使用默认 IDF", () => {
    const { norm } = tfidfVector("生词", {});
    expect(norm).toBe(1);
  });
});

describe("cosineSimilarity", () => {
  it("相同向量为 1", () => {
    const a = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    expect(cosineSimilarity(a, 1, a, 1)).toBeCloseTo(1);
  });

  it("正交向量为 0", () => {
    expect(cosineSimilarity({ x: 1 }, 1, { y: 1 }, 1)).toBe(0);
  });

  it("零向量相似度为 0", () => {
    expect(cosineSimilarity({}, 0, { x: 1 }, 1)).toBe(0);
  });

  it("语义相近文本相似度高于无关文本", () => {
    const docs = [
      "本周复盘了基金定投策略，讨论了估值与加仓时机，关注长期收益与风险分散",
      "基金定投的价值投资方法：估值判断、加仓纪律、分散风险与长期持有",
      "今天做了红烧肉，需要五花肉、生抽老抽冰糖，小火慢炖收汁",
    ];
    const idf = buildIdf(docs);
    const v0 = tfidfVector(docs[0], idf);
    const v1 = tfidfVector(docs[1], idf);
    const v2 = tfidfVector(docs[2], idf);
    const simFinance = cosineSimilarity(v0.vector, v0.norm, v1.vector, v1.norm);
    const simFood = cosineSimilarity(v0.vector, v0.norm, v2.vector, v2.norm);
    expect(simFinance).toBeGreaterThan(simFood);
    expect(simFinance).toBeGreaterThan(0.1);
  });
});

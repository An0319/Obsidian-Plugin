/**
 * TF-IDF 数学计算（纯函数，无外部依赖）
 *
 * - TF：词在文档中的频次 / 文档总词数
 * - IDF：log((1 + N) / (1 + df)) + 1（平滑，避免除零）
 * - 余弦相似度基于归一化向量点积
 */

import { tokenize, termFrequency } from "./tokenizer";

/** 一组文档对应的 IDF 表：词 -> 在多少篇文档中出现过 */
export function buildIdf(documents: string[]): Record<string, number> {
  const df: Record<string, number> = {};
  const seen = new Set<string>();
  for (const doc of documents) {
    seen.clear();
    for (const token of tokenize(doc)) {
      if (!seen.has(token)) {
        seen.add(token);
        df[token] = (df[token] ?? 0) + 1;
      }
    }
  }
  const n = Math.max(documents.length, 1);
  const idf: Record<string, number> = {};
  for (const [token, count] of Object.entries(df)) {
    idf[token] = Math.log((1 + n) / (1 + count)) + 1;
  }
  return idf;
}

/** 计算 TF-IDF 向量并归一化，返回 { 词: 权重 } 与模长 */
export function tfidfVector(
  text: string,
  idf: Record<string, number>
): { vector: Record<string, number>; norm: number } {
  const tf = termFrequency(tokenize(text));
  const total = Object.values(tf).reduce((s, v) => s + v, 0);
  const vector: Record<string, number> = {};
  if (total === 0) return { vector, norm: 0 };

  let norm = 0;
  for (const [token, count] of Object.entries(tf)) {
    const w = (count / total) * (idf[token] ?? Math.log(2) + 1);
    vector[token] = w;
    norm += w * w;
  }
  norm = Math.sqrt(norm);
  // 归一化：余弦相似度可直接用点积
  if (norm > 0) {
    for (const token of Object.keys(vector)) {
      vector[token] /= norm;
    }
  }
  return { vector, norm: 1 };
}

/** 计算两个稀疏向量的余弦相似度（输入应为归一化向量，否则结果按余弦公式仍正确） */
export function cosineSimilarity(
  a: Record<string, number>,
  normA: number,
  b: Record<string, number>,
  normB: number
): number {
  if (normA === 0 || normB === 0) return 0;
  // 以短向量遍历求点积
  const [small, large] =
    Object.keys(a).length <= Object.keys(b).length ? [a, b] : [b, a];
  let dot = 0;
  for (const [token, w] of Object.entries(small)) {
    const other = large[token];
    if (other !== undefined) dot += w * other;
  }
  return dot / (normA * normB);
}

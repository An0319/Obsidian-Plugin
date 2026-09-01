/**
 * 多语言分词器（纯函数，无外部依赖）
 *
 * 策略：
 * - 英文/数字：按连续字母数字段切分，小写化
 * - 中文：滑窗二元组（bigram），无需词典即可捕捉局部语义
 * - 混合文本：先按"非中英数"分隔，再对中文片段做二元组
 */

/** 匹配连续的中文（CJK 统一表意文字及其扩展A）片段 */
const CJK_SEGMENT = /[\u4e00-\u9fff\u3400-\u4dbf]+/g;
/** 英文单词或数字序列 */
const WORD = /[a-z0-9]+/g;

/** 提取一个中文片段内的二元组 */
function cjkBigrams(segment: string): string[] {
  if (segment.length === 1) return [segment];
  const grams: string[] = [];
  for (let i = 0; i < segment.length - 1; i++) {
    grams.push(segment.slice(i, i + 2));
  }
  return grams;
}

/** 简单去除常见 Markdown 语法噪声，降低干扰 */
export function stripMarkdownNoise(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ") // 代码块
    .replace(/`[^`]*`/g, " ") // 行内代码
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 图片
    .replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, " $1 ") // wiki 链接，保留目标名
    .replace(/\[([^\]]*)\]\([^)]*\)/g, " $1 ") // 普通链接，保留文本
    .replace(/https?:\/\/\S+/g, " "); // URL
}

/** 分词：返回 token 数组 */
export function tokenize(text: string): string[] {
  const cleaned = stripMarkdownNoise(text);
  const tokens: string[] = [];

  // 英文单词与数字
  for (const m of cleaned.toLowerCase().matchAll(WORD)) {
    tokens.push(m[0]);
  }
  // 中文二元组
  for (const m of cleaned.matchAll(CJK_SEGMENT)) {
    tokens.push(...cjkBigrams(m[0]));
  }
  return tokens;
}

/** 统计词频 */
export function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const t of tokens) {
    tf[t] = (tf[t] ?? 0) + 1;
  }
  return tf;
}

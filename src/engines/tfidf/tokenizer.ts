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

/**
 * 英文停用词表：高频、无语义区分度的功能词。
 * 参与统计会稀释 TF-IDF 的主题信号，切分后直接过滤。
 */
const EN_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
  "can", "could", "did", "do", "does", "doing", "for", "from", "had", "has",
  "have", "having", "he", "her", "here", "hers", "him", "his", "how", "i",
  "if", "in", "into", "is", "it", "its", "just", "me", "my", "no", "nor",
  "not", "of", "on", "or", "our", "ours", "out", "over", "own", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "theirs",
  "them", "then", "there", "these", "they", "this", "those", "to", "too",
  "up", "very", "was", "we", "were", "what", "when", "where", "which",
  "while", "who", "whom", "why", "will", "with", "would", "you", "your",
]);

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/**
 * 英文轻量词干化（后缀规则，不处理不规则变形）：
 * - ies -> y（studies -> study）
 * - sses -> ss（classes -> class）
 * - 末尾 s（长度 > 3，非 ss/us/is 结尾）-> 去掉（notes -> note）
 * - ing / ed：去掉后若出现双写辅音再还原一个（running -> run，stopped -> stop）
 * - ly -> 去掉（quickly -> quick）
 */
export function stemEnglish(token: string): string {
  if (!/^[a-z]+$/.test(token)) return token;
  if (token.length > 4 && token.endsWith("ies")) return token.slice(0, -3) + "y";
  if (token.length > 4 && token.endsWith("sses")) return token.slice(0, -2);
  if (
    token.length > 3 &&
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("us") &&
    !token.endsWith("is")
  ) {
    token = token.slice(0, -1);
  }
  if (token.length > 5 && token.endsWith("ing")) {
    token = reduceDoubleConsonant(token.slice(0, -3));
  } else if (token.length > 4 && token.endsWith("ed")) {
    token = reduceDoubleConsonant(token.slice(0, -2));
  }
  if (token.length > 4 && token.endsWith("ly")) {
    token = token.slice(0, -2);
  }
  return token;
}

/** 还原去后缀后的双写辅音：runn -> run；元音结尾（need）保持不变 */
function reduceDoubleConsonant(word: string): string {
  const last = word.at(-1);
  const prev = word.at(-2);
  if (
    word.length >= 4 &&
    last !== undefined &&
    prev !== undefined &&
    last === prev &&
    !VOWELS.has(last)
  ) {
    return word.slice(0, -1);
  }
  return word;
}

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

/** 分词：返回 token 数组（英文经停用词过滤与轻量词干化） */
export function tokenize(text: string): string[] {
  const cleaned = stripMarkdownNoise(text);
  const tokens: string[] = [];

  // 英文单词与数字
  for (const m of cleaned.toLowerCase().matchAll(WORD)) {
    const word = m[0];
    if (EN_STOPWORDS.has(word)) continue;
    tokens.push(stemEnglish(word));
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

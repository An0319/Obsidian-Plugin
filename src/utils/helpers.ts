import { RuleField, RuleOperator, OrganizeRule } from "../types";

/** 提取标签：匹配 #标签 形式（排除代码块内的伪标签由调用方负责简化处理） */
const TAG_PATTERN = /(^|\s)#([\p{L}\p{N}_\/-]+)/gu;

/** 从笔记正文中提取所有标签（去掉 # 前缀） */
export function extractTags(content: string): string[] {
  const tags: string[] = [];
  for (const match of content.matchAll(TAG_PATTERN)) {
    tags.push(match[2]);
  }
  return tags;
}

/** 安全编译正则，失败返回 null */
export function compileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "iu");
  } catch {
    return null;
  }
}

/** 取不含扩展名的文件名："Inbox/2026-09-01.md" -> "2026-09-01" */
export function baseName(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * 评估单条规则是否命中
 * @returns 命中返回 true；规则非法（如正则无效）返回 false
 */
export function matchRule(
  rule: OrganizeRule,
  title: string,
  content: string,
  filePath: string
): boolean {
  if (!rule.enabled || !rule.pattern) return false;

  let haystack: string;
  switch (rule.field) {
    case RuleField.Title:
      haystack = title;
      break;
    case RuleField.Content:
      haystack = content;
      break;
    case RuleField.Tag:
      haystack = extractTags(content).join(" ");
      break;
    case RuleField.Filename:
      // 文件名字段：对文件名（不含扩展名）与完整路径分别评估
      return matchAgainst(
        rule,
        [baseName(filePath), filePath],
        content
      );
    default:
      return false;
  }

  return matchAgainst(rule, [haystack], content);
}

/** 对一组候选文本按规则操作符评估，任一命中即通过 */
function matchAgainst(
  rule: OrganizeRule,
  candidates: string[],
  content: string
): boolean {
  switch (rule.operator) {
    case RuleOperator.Contains:
      return candidates.some((c) =>
        c.toLowerCase().includes(rule.pattern.toLowerCase())
      );
    case RuleOperator.Equals:
      if (rule.field === RuleField.Tag) {
        // 标签精确匹配：逐个比较
        return extractTags(content).some(
          (t) => t.toLowerCase() === rule.pattern.toLowerCase()
        );
      }
      return candidates.some(
        (c) => c.toLowerCase() === rule.pattern.toLowerCase()
      );
    case RuleOperator.Regex: {
      const re = compileRegex(rule.pattern);
      return re !== null && candidates.some((c) => re.test(c));
    }
    default:
      return false;
  }
}

/**
 * 规范化文件夹路径：去除首尾斜杠与多余空白
 * "  /02-战略/竞品/  " -> "02-战略/竞品"
 */
export function normalizeFolderPath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

/** 校验共享配置文件的基本合法性 */
export function isValidSharedConfig(obj: unknown): obj is {
  formatVersion: number;
  name: string;
  description?: string;
  exportedAt?: string;
  rules: unknown[];
  folderVectors: unknown[];
  threshold: number;
  idf: Record<string, number>;
} {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.formatVersion === "number" &&
    typeof o.name === "string" &&
    Array.isArray(o.rules) &&
    Array.isArray(o.folderVectors) &&
    typeof o.threshold === "number" &&
    typeof o.idf === "object" &&
    o.idf !== null
  );
}

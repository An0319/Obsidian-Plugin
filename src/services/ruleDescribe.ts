import { OrganizeRule, RuleField, RuleOperator } from "../types";

/** 匹配字段的中文名称（用于规则列表展示） */
export const FIELD_LABELS: Record<string, string> = {
  [RuleField.Title]: "标题",
  [RuleField.Content]: "笔记内容",
  [RuleField.Tag]: "标签",
  [RuleField.Filename]: "文件名",
  [RuleField.ModifiedTime]: "修改时间",
};

/**
 * 常见正则模式 → 通俗描述词典（键为去空格后的正则原文）。
 * 覆盖内置种子规则与常见手写模式；未命中返回 null，由调用方显示通用兜底文案。
 */
const REGEX_PLAIN_TEXT: Record<string, string> = {
  // 种子规则「日志归位」：文件名以日期开头（2026-09-01 / 2026_9_1 / 2026年9月1日 / 20260901 等）
  ["^\\d{4}[-_/年.](0?[1-9]|1[0-2])([-_/年.](0?[1-9]|[12]\\d|3[01])日?)?(?!\\d)|^\\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])(?!\\d)"]:
    "以日期开头（如 2026-09-01、2026年9月、20260901）",
  // 手写常见：整个文件名是 2026-09-01 这类日期
  ["^\\d{4}-\\d{2}-\\d{2}$"]: "是日期格式（如 2026-09-01）",
  // 手写常见：整个文件名是 8 位数字
  ["^\\d{8}$"]: "是 8 位数字（如 20260901）",
};

/**
 * 把正则表达式转译成通俗中文描述。
 * 命中词典返回谓语片段（拼接在字段名后，如「以日期开头（如 2026-09-01）」）；
 * 未命中返回 null。
 * 纯函数：只读输入，零副作用。
 */
export function describeRegexPattern(pattern: string): string | null {
  return REGEX_PLAIN_TEXT[pattern.replace(/\s+/g, "")] ?? null;
}

/**
 * 生成规则的人类可读描述（用于规则列表展示，面向普通用户，不暴露符号）。
 * 纯函数：只读输入，零副作用。
 */
export function describeRule(rule: OrganizeRule): string {
  const fieldLabel = FIELD_LABELS[rule.field] ?? rule.field;
  switch (rule.operator) {
    case RuleOperator.Regex: {
      const plain = describeRegexPattern(rule.pattern);
      return plain
        ? `${fieldLabel}${plain}`
        : `${fieldLabel}符合某个固定规律（点「编辑」查看具体写法）`;
    }
    case RuleOperator.Equals:
      return `${fieldLabel}完全等于「${rule.pattern}」`;
    case RuleOperator.OlderThanDays:
      return `超过 ${rule.pattern} 天未修改`;
    case RuleOperator.Always:
      return "所有笔记都适用（兜底）";
    default:
      return `${fieldLabel}含有「${rule.pattern}」这些字`;
  }
}

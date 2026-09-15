import { OrganizeRule, RuleField, RuleOperator } from "../types";
import { normalizeFolderPath } from "../utils/helpers";

/** custom_rules.json 文件格式（库根目录，用户手工维护） */
export interface CustomRulesFile {
  formatVersion: 1;
  description?: string;
  rules: OrganizeRule[];
}

/** custom_rules.json 的固定存放路径（Vault 根目录） */
export const CUSTOM_RULES_PATH = "custom_rules.json";

const FIELDS = new Set<string>(Object.values(RuleField));
const OPERATORS = new Set<string>(Object.values(RuleOperator));

/**
 * 规范化一条导入的规则：补全缺失字段、校验枚举合法性、夹紧权重。
 * 返回 null 表示该条规则不可用（调用方跳过并在结果中说明）。
 */
export function normalizeImportedRule(raw: unknown, index: number): OrganizeRule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!name) return null;

  const field = String(o.field ?? "");
  if (!FIELDS.has(field)) return null;

  const operator = String(o.operator ?? "");
  if (!OPERATORS.has(operator)) return null;

  const targetFolder = normalizeFolderPath(String(o.targetFolder ?? ""));
  if (!targetFolder) return null;

  let weight: number | undefined;
  if (typeof o.weight === "number" && Number.isFinite(o.weight)) {
    weight = Math.min(1, Math.max(0, o.weight));
  }

  return {
    id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : `custom-${Date.now()}-${index}`,
    name,
    field: field as RuleField,
    operator: operator as RuleOperator,
    pattern: typeof o.pattern === "string" ? o.pattern : "",
    targetFolder,
    enabled: o.enabled === undefined ? true : o.enabled === true,
    weight,
  };
}

/**
 * 解析 custom_rules.json 内容。
 * 成功返回规范化规则列表与描述；失败抛出带原因的异常。
 */
export function parseCustomRules(json: string): { rules: OrganizeRule[]; description: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("custom_rules.json 不是合法的 JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("custom_rules.json 内容必须是对象");
  }
  const o = parsed as Record<string, unknown>;

  if (typeof o.formatVersion === "number" && o.formatVersion > 1) {
    throw new Error(`formatVersion ${o.formatVersion} 高于当前插件支持的版本 1，请升级插件`);
  }
  if (!Array.isArray(o.rules)) {
    throw new Error("custom_rules.json 缺少 rules 数组");
  }

  const rules: OrganizeRule[] = [];
  let skipped = 0;
  o.rules.forEach((raw, index) => {
    const rule = normalizeImportedRule(raw, index);
    if (rule) rules.push(rule);
    else skipped++;
  });

  if (rules.length === 0) {
    throw new Error("custom_rules.json 中没有可用的规则（检查 name/field/operator/targetFolder 是否完整）");
  }

  const note = skipped > 0 ? `（跳过 ${skipped} 条格式错误的规则）` : "";
  return {
    rules,
    description:
      (typeof o.description === "string" ? o.description : "") || `custom_rules.json${note}`,
  };
}

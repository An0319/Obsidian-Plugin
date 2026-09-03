import {
  IOrganizeEngine,
  OrganizeRule,
  Suggestion,
  EngineLevel,
  RuleField,
  RuleOperator,
} from "../types";
import { matchRule, normalizeFolderPath } from "../utils/helpers";

/**
 * 层级一：规则映射引擎
 * 按用户定义的规则顺序匹配，命中第一条即返回目标文件夹。
 * 纯 TypeScript 实现，零外部依赖，所有设备可用。
 */
export class RuleEngine implements IOrganizeEngine {
  readonly name = "规则映射";
  readonly level = EngineLevel.Rules;

  constructor(private rules: OrganizeRule[]) {}

  setRules(rules: OrganizeRule[]): void {
    this.rules = rules;
  }

  async analyze(
    title: string,
    content: string,
    filePath: string,
    mtime?: number
  ): Promise<Suggestion> {
    // 按数组顺序（优先级）匹配，命中第一条即返回
    for (const rule of this.rules) {
      if (matchRule(rule, title, content, filePath, mtime)) {
        return {
          suggestedPath: normalizeFolderPath(rule.targetFolder),
          confidence: Math.min(1, rule.weight ?? 1),
          reason: `命中规则「${rule.name}」`,
          engine: this.level,
        };
      }
    }
    return {
      suggestedPath: "",
      confidence: 0,
      reason: "没有命中任何规则",
      engine: this.level,
    };
  }
}

/**
 * 种子规则集（Seed Rule-set）：全新安装时的默认规则
 * 体现"行为即规则"产品理念——文件名是日期进日志、超过 30 天未修改进归档、
 * 其余情况兜底进收件箱；语义分类交给 custom_rules.json（V0.2）。
 * 用户可一键重新导入。
 */
export function defaultRules(): OrganizeRule[] {
  return [
    {
      id: "seed-journal",
      name: "日志归位",
      field: RuleField.Filename,
      operator: RuleOperator.Regex,
      // 文件名以日期开头（2026-09-01、2026-09-01 会议记录等）
      pattern: "^\\d{4}-\\d{2}-\\d{2}",
      targetFolder: "日志",
      enabled: true,
    },
    {
      id: "seed-archive",
      name: "归档陈旧笔记",
      field: RuleField.ModifiedTime,
      operator: RuleOperator.OlderThanDays,
      pattern: "30",
      targetFolder: "归档",
      enabled: true,
    },
    {
      id: "seed-inbox-fallback",
      name: "收件箱兜底",
      field: RuleField.Filename,
      operator: RuleOperator.Always,
      pattern: "",
      targetFolder: "收件箱",
      enabled: true,
    },
  ];
}

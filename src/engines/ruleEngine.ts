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
    filePath: string
  ): Promise<Suggestion> {
    // 按数组顺序（优先级）匹配，命中第一条即返回
    for (const rule of this.rules) {
      if (matchRule(rule, title, content, filePath)) {
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

/** 内置默认规则模板，用户可一键导入 */
export function defaultRules(): OrganizeRule[] {
  return [
    {
      id: "default-invest",
      name: "投资笔记",
      field: RuleField.Content,
      operator: RuleOperator.Contains,
      pattern: "投资",
      targetFolder: "投资笔记",
      enabled: true,
    },
    {
      id: "default-meeting",
      name: "会议记录",
      field: RuleField.Title,
      operator: RuleOperator.Contains,
      pattern: "会议",
      targetFolder: "会议记录",
      enabled: true,
    },
    {
      id: "default-daily",
      name: "日记",
      field: RuleField.Filename,
      operator: RuleOperator.Regex,
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      targetFolder: "日记",
      enabled: true,
    },
    {
      id: "default-todo",
      name: "待办清单",
      field: RuleField.Tag,
      operator: RuleOperator.Equals,
      pattern: "todo",
      targetFolder: "待办",
      enabled: true,
    },
  ];
}

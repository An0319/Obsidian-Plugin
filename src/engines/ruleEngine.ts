import {
  IOrganizeEngine,
  OrganizeRule,
  Suggestion,
  EngineLevel,
  RuleField,
  RuleOperator,
} from "../types";
import { matchRule, resolveRuleTarget } from "../utils/helpers";

/**
 * 层级一：规则映射引擎
 * 按用户定义的规则顺序匹配，命中第一条即返回目标文件夹。
 * 纯 TypeScript 实现，零外部依赖，所有设备可用。
 */
export class RuleEngine implements IOrganizeEngine {
  readonly name = "规则映射";
  readonly level = EngineLevel.Rules;

  private inboxFolder = "";

  constructor(
    private rules: OrganizeRule[],
    inboxFolder = ""
  ) {
    this.inboxFolder = inboxFolder;
  }

  setRules(rules: OrganizeRule[]): void {
    this.rules = rules;
  }

  /** 同步 Inbox 文件夹名，供 {inbox} 占位符解析 */
  setInboxFolder(folder: string): void {
    this.inboxFolder = folder;
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
          suggestedPath: resolveRuleTarget(rule.targetFolder, this.inboxFolder),
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
 * 体现"行为即规则"产品理念——文件名是日期进日志、其余情况兜底进收件箱；
 * 语义分类交给 custom_rules.json（V0.2）。用户可一键重新导入。
 * 兜底目标用 {inbox} 占位符跟随 Inbox 设置；陈旧归档属时间型破坏性规则，
 * 默认关闭——它在兜底链上会归档所有语义弃权的笔记，需用户显式开启。
 */
export function defaultRules(): OrganizeRule[] {
  return [
    {
      id: "seed-journal",
      name: "日志归位",
      field: RuleField.Filename,
      operator: RuleOperator.Regex,
      // 文件名以日期开头：2026-09-01 / 2026_09_01 / 2026年9月1日 / 年月 2026-09 / 紧凑 20260901
      // 月限定 01-12、日限定 01-31；紧凑格式用 (?!\d) 防止电话号码等长数字串误命中
      pattern:
        "^\\d{4}[-_/年.](0?[1-9]|1[0-2])([-_/年.](0?[1-9]|[12]\\d|3[01])日?)?(?!\\d)|^\\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])(?!\\d)",
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
      enabled: false,
    },
    {
      id: "seed-inbox-fallback",
      name: "收件箱兜底",
      field: RuleField.Filename,
      operator: RuleOperator.Always,
      pattern: "",
      targetFolder: "{inbox}",
      enabled: true,
    },
  ];
}

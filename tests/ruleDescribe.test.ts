import { describe, expect, it } from "vitest";
import { describeRegexPattern, describeRule } from "../src/services/ruleDescribe";
import { defaultRules } from "../src/engines/ruleEngine";
import { OrganizeRule, RuleField, RuleOperator } from "../src/types";

function rule(partial: Partial<OrganizeRule>): OrganizeRule {
  return {
    id: "r1",
    name: "测试规则",
    field: RuleField.Filename,
    operator: RuleOperator.Contains,
    pattern: "",
    targetFolder: "目标",
    enabled: true,
    ...partial,
  };
}

describe("ruleDescribe", () => {
  describe("describeRegexPattern", () => {
    it("种子日期正则转译为通俗描述", () => {
      const seed = defaultRules().find((r) => r.id === "seed-journal")!;
      expect(describeRegexPattern(seed.pattern)).toBe(
        "以日期开头（如 2026-09-01、2026年9月、20260901）"
      );
    });

    it("常见手写模式可转译", () => {
      expect(describeRegexPattern("^\\d{4}-\\d{2}-\\d{2}$")).toBe("是日期格式（如 2026-09-01）");
      expect(describeRegexPattern("^\\d{8}$")).toBe("是 8 位数字（如 20260901）");
    });

    it("正则中的空白不影响词典命中", () => {
      expect(describeRegexPattern("^\\d{8} $")).toBe("是 8 位数字（如 20260901）");
    });

    it("未识别的正则返回 null", () => {
      expect(describeRegexPattern("^[A-Z]{3}$")).toBeNull();
    });
  });

  describe("describeRule", () => {
    it("各匹配方式输出通俗中文", () => {
      expect(describeRule(rule({ operator: RuleOperator.Contains, pattern: "投资" }))).toBe(
        "文件名含有「投资」这些字"
      );
      expect(describeRule(rule({ field: RuleField.Title, operator: RuleOperator.Equals, pattern: "周报" }))).toBe(
        "标题完全等于「周报」"
      );
      expect(describeRule(rule({ operator: RuleOperator.OlderThanDays, pattern: "30" }))).toBe(
        "超过 30 天未修改"
      );
      expect(describeRule(rule({ operator: RuleOperator.Always }))).toBe(
        "所有笔记都适用（兜底）"
      );
    });

    it("正则规则输出通俗描述，未识别时兜底", () => {
      const seed = defaultRules().find((r) => r.id === "seed-journal")!;
      expect(describeRule(seed)).toContain("以日期开头");
      expect(describeRule(rule({ operator: RuleOperator.Regex, pattern: "^[A-Z]{3}$" }))).toBe(
        "文件名符合某个固定规律（点「编辑」查看具体写法）"
      );
    });

    it("内置规则描述不含正则符号（面向普通用户防复发）", () => {
      for (const r of defaultRules()) {
        const text = describeRule(r);
        expect(text).not.toMatch(/[\\^${}|()?*+[\]]/);
        expect(text).not.toContain("\\d");
      }
    });
  });
});

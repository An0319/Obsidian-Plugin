import { describe, it, expect } from "vitest";
import {
  CUSTOM_RULES_PATH,
  normalizeImportedRule,
  parseCustomRules,
  buildSampleRulesJson,
} from "../src/services/customRulesLoader";
import { RuleField, RuleOperator } from "../src/types";

describe("customRulesLoader", () => {
  it("CUSTOM_RULES_PATH 位于库根目录", () => {
    expect(CUSTOM_RULES_PATH).toBe("custom_rules.json");
  });

  describe("normalizeImportedRule", () => {
    const valid = {
      name: "技术笔记",
      field: "content",
      operator: "contains",
      pattern: "React",
      targetFolder: "技术/前端",
    };

    it("完整规则通过并保留 weight", () => {
      const rule = normalizeImportedRule({ ...valid, id: "r1", weight: 0.8 }, 0);
      expect(rule).toMatchObject({
        id: "r1",
        name: "技术笔记",
        field: RuleField.Content,
        operator: RuleOperator.Contains,
        targetFolder: "技术/前端",
        weight: 0.8,
      });
      expect(rule?.enabled).toBe(true);
    });

    it("缺失字段补全默认值", () => {
      const rule = normalizeImportedRule(
        { name: "技术笔记", field: "content", operator: "contains", targetFolder: "技术" },
        3
      );
      expect(rule?.id).toContain("custom-");
      expect(rule?.pattern).toBe("");
      expect(rule?.weight).toBeUndefined();
    });

    it("weight 越界夹紧到 0~1", () => {
      expect(normalizeImportedRule({ ...valid, weight: 5 }, 0)?.weight).toBe(1);
      expect(normalizeImportedRule({ ...valid, weight: -2 }, 0)?.weight).toBe(0);
      expect(normalizeImportedRule({ ...valid, weight: Number.NaN }, 0)?.weight).toBeUndefined();
    });

    it("targetFolder 规范化首尾斜杠", () => {
      const rule = normalizeImportedRule({ ...valid, targetFolder: " /技术/前端/ " }, 0);
      expect(rule?.targetFolder).toBe("技术/前端");
    });

    it.each<[unknown, string]>([
      [null, "null"],
      [{}, "空对象"],
      [{ ...valid, name: "" }, "空名称"],
      [{ ...valid, field: "unknown" }, "非法字段"],
      [{ ...valid, operator: "unknown" }, "非法操作符"],
      [{ ...valid, targetFolder: "" }, "空目标"],
    ])("无效规则返回 null：$1", (raw) => {
      expect(normalizeImportedRule(raw, 0)).toBeNull();
    });
  });

  describe("parseCustomRules", () => {
    const ruleJson = {
      formatVersion: 1,
      description: "我的规则",
      rules: [
        {
          name: "技术笔记",
          field: "content",
          operator: "contains",
          pattern: "React",
          targetFolder: "技术",
        },
      ],
    };

    it("解析成功返回规范化规则与描述", () => {
      const { rules, description } = parseCustomRules(JSON.stringify(ruleJson));
      expect(rules).toHaveLength(1);
      expect(rules[0].targetFolder).toBe("技术");
      expect(description).toBe("我的规则");
    });

    it("跳过格式错误的规则并在描述中说明", () => {
      const json = JSON.stringify({
        formatVersion: 1,
        rules: [ruleJson.rules[0], { name: "坏规则", field: "xxx" }],
      });
      const { rules, description } = parseCustomRules(json);
      expect(rules).toHaveLength(1);
      expect(description).toContain("跳过 1 条");
    });

    it.each([
      ["not json", "不是合法的 JSON"],
      [JSON.stringify([1]), "内容必须是对象"],
      [JSON.stringify({ formatVersion: 2, rules: [] }), "高于当前插件支持"],
      [JSON.stringify({ formatVersion: 1 }), "缺少 rules 数组"],
      [JSON.stringify({ formatVersion: 1, rules: [{ name: "坏" }] }), "没有可用的规则"],
    ])("非法输入抛出可读错误：%#", (json, expected) => {
      expect(() => parseCustomRules(json)).toThrow(expected);
    });
  });

  describe("buildSampleRulesJson（round-trip 不变量）", () => {
    it("样例输出能被 parseCustomRules 完整解析且字段无损", () => {
      const json = buildSampleRulesJson();
      const { rules, description } = parseCustomRules(json);
      expect(rules).toHaveLength(2);
      expect(description).toContain("示例");

      expect(rules[0]).toMatchObject({
        id: "sample-meeting",
        field: RuleField.Filename,
        operator: RuleOperator.Contains,
        pattern: "会议",
        targetFolder: "会议记录",
        weight: 0.8,
        enabled: true,
      });
      expect(rules[1]).toMatchObject({
        id: "sample-old",
        field: RuleField.ModifiedTime,
        operator: RuleOperator.OlderThanDays,
        pattern: "30",
        targetFolder: "归档",
        weight: 0.7,
        enabled: true,
      });
    });

    it("样例 description 为通俗说明且样例 id 带前缀", () => {
      const json = buildSampleRulesJson();
      expect(json).toContain("规则名称");
      expect(json).toContain("目标文件夹");
    });
  });
});

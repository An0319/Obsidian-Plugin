import { describe, it, expect } from "vitest";
import { matchRule, normalizeFolderPath, compileRegex, extractTags, isValidSharedConfig } from "../src/utils/helpers";
import { OrganizeRule, RuleField, RuleOperator } from "../src/types";

function rule(partial: Partial<OrganizeRule>): OrganizeRule {
  return {
    id: "t",
    name: "t",
    field: RuleField.Content,
    operator: RuleOperator.Contains,
    pattern: "",
    targetFolder: "",
    enabled: true,
    ...partial,
  };
}

describe("helpers", () => {
  it("normalizeFolderPath 清理斜杠与空白", () => {
    expect(normalizeFolderPath("  /a//b/  ")).toBe("a/b");
    expect(normalizeFolderPath("/")).toBe("");
  });

  it("compileRegex 非法正则返回 null", () => {
    expect(compileRegex("([")).toBeNull();
    expect(compileRegex("^\\d+$")).toBeInstanceOf(RegExp);
  });

  it("extractTags 提取标签", () => {
    expect(extractTags("#todo 买菜 #生活/日常")).toEqual(["todo", "生活/日常"]);
    expect(extractTags("没有标签")).toEqual([]);
  });

  it("matchRule 对空 pattern 返回 false", () => {
    expect(matchRule(rule({}), "t", "c", "p")).toBe(false);
  });

  it("isValidSharedConfig 校验字段", () => {
    const valid = {
      formatVersion: 1,
      name: "x",
      rules: [],
      folderVectors: [],
      threshold: 0.3,
      idf: {},
    };
    expect(isValidSharedConfig(valid)).toBe(true);
    expect(isValidSharedConfig({ ...valid, threshold: "bad" })).toBe(false);
    expect(isValidSharedConfig(null)).toBe(false);
    expect(isValidSharedConfig("str")).toBe(false);
  });
});

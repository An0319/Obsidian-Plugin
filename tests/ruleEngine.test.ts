import { describe, it, expect } from "vitest";
import { RuleEngine, defaultRules } from "../src/engines/ruleEngine";
import { OrganizeRule, RuleField, RuleOperator } from "../src/types";

function rule(partial: Partial<OrganizeRule> & { id: string }): OrganizeRule {
  return {
    name: partial.id,
    field: RuleField.Content,
    operator: RuleOperator.Contains,
    pattern: "",
    targetFolder: "",
    enabled: true,
    ...partial,
  };
}

describe("RuleEngine", () => {
  it("内容包含规则命中", async () => {
    const engine = new RuleEngine([
      rule({ id: "r1", pattern: "投资", targetFolder: "投资笔记" }),
    ]);
    const result = await engine.analyze("随便", "这篇讲基金定投与投资策略", "Inbox/a.md");
    expect(result.suggestedPath).toBe("投资笔记");
    expect(result.confidence).toBe(1);
  });

  it("标题包含规则命中", async () => {
    const engine = new RuleEngine([
      rule({
        id: "r1",
        field: RuleField.Title,
        pattern: "会议",
        targetFolder: "会议记录",
      }),
    ]);
    const result = await engine.analyze("产品评审会议纪要", "正文无关", "Inbox/a.md");
    expect(result.suggestedPath).toBe("会议记录");
  });

  it("标签等于规则命中", async () => {
    const engine = new RuleEngine([
      rule({
        id: "r1",
        field: RuleField.Tag,
        operator: RuleOperator.Equals,
        pattern: "todo",
        targetFolder: "待办",
      }),
    ]);
    const result = await engine.analyze("待办", "#todo 买东西 #other", "Inbox/a.md");
    expect(result.suggestedPath).toBe("待办");
  });

  it("标签等于规则不误伤子串标签", async () => {
    const engine = new RuleEngine([
      rule({
        id: "r1",
        field: RuleField.Tag,
        operator: RuleOperator.Equals,
        pattern: "todo",
        targetFolder: "待办",
      }),
    ]);
    const result = await engine.analyze("x", "#todolist 逛街", "Inbox/a.md");
    expect(result.suggestedPath).toBe("");
  });

  it("文件名正则规则命中", async () => {
    const engine = new RuleEngine([
      rule({
        id: "r1",
        field: RuleField.Filename,
        operator: RuleOperator.Regex,
        pattern: "^\\d{4}-\\d{2}-\\d{2}$",
        targetFolder: "日记",
      }),
    ]);
    const hit = await engine.analyze("2026-09-01", "内容", "Inbox/2026-09-01.md");
    expect(hit.suggestedPath).toBe("日记");

    const miss = await engine.analyze("随笔", "内容", "Inbox/随笔.md");
    expect(miss.suggestedPath).toBe("");
  });

  it("按数组顺序优先匹配第一条命中规则", async () => {
    const engine = new RuleEngine([
      rule({ id: "first", pattern: "投资", targetFolder: "优先级高" }),
      rule({ id: "second", pattern: "投资", targetFolder: "优先级低" }),
    ]);
    const result = await engine.analyze("t", "投资相关", "a.md");
    expect(result.suggestedPath).toBe("优先级高");
  });

  it("禁用规则被跳过", async () => {
    const engine = new RuleEngine([
      rule({ id: "off", pattern: "投资", targetFolder: "x", enabled: false }),
    ]);
    const result = await engine.analyze("t", "投资", "a.md");
    expect(result.suggestedPath).toBe("");
  });

  it("非法正则不抛异常按未命中处理", async () => {
    const engine = new RuleEngine([
      rule({ id: "bad", operator: RuleOperator.Regex, pattern: "([不闭合", targetFolder: "x" }),
    ]);
    const result = await engine.analyze("t", "任意内容", "a.md");
    expect(result.suggestedPath).toBe("");
  });

  it("目标路径被规范化（去首尾斜杠）", async () => {
    const engine = new RuleEngine([
      rule({ id: "r1", pattern: "投资", targetFolder: "  /02-战略/竞品/  " }),
    ]);
    const result = await engine.analyze("t", "投资", "a.md");
    expect(result.suggestedPath).toBe("02-战略/竞品");
  });

  it("无命中返回空建议", async () => {
    const engine = new RuleEngine(defaultRules());
    const result = await engine.analyze("美食", "今天吃火锅", "a.md");
    expect(result.suggestedPath).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("中文大小写不敏感匹配", async () => {
    const engine = new RuleEngine([
      rule({ id: "r1", pattern: "REACT", targetFolder: "前端" }),
    ]);
    const result = await engine.analyze("t", "学了 react hooks", "a.md");
    expect(result.suggestedPath).toBe("前端");
  });
});

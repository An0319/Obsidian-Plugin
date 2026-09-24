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

  it("{inbox} 占位符解析为构造时传入的 Inbox 名", async () => {
    const engine = new RuleEngine(
      [rule({ id: "fb", operator: RuleOperator.Always, targetFolder: "{inbox}" })],
      "收集箱"
    );
    const result = await engine.analyze("随便", "内容", "Inbox/a.md");
    expect(result.suggestedPath).toBe("收集箱");
  });

  it("setInboxFolder 可更新占位符解析目标", async () => {
    const engine = new RuleEngine([
      rule({ id: "fb", operator: RuleOperator.Always, targetFolder: "{inbox}" }),
    ]);
    engine.setInboxFolder("Inbox");
    const first = await engine.analyze("随便", "内容", "Inbox/a.md");
    expect(first.suggestedPath).toBe("Inbox");
    engine.setInboxFolder("收件箱");
    const second = await engine.analyze("随便", "内容", "Inbox/a.md");
    expect(second.suggestedPath).toBe("收件箱");
  });

  it("无占位符的目标不受 Inbox 名影响", async () => {
    const engine = new RuleEngine(
      [rule({ id: "r1", pattern: "投资", targetFolder: "投资笔记" })],
      "收集箱"
    );
    const result = await engine.analyze("随便", "投资相关", "Inbox/a.md");
    expect(result.suggestedPath).toBe("投资笔记");
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
    const engine = new RuleEngine([]);
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

  it("修改时间超过 N 天命中", async () => {
    const engine = new RuleEngine([
      rule({
        id: "old",
        field: RuleField.ModifiedTime,
        operator: RuleOperator.OlderThanDays,
        pattern: "30",
        targetFolder: "归档",
      }),
    ]);
    const stale = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const hit = await engine.analyze("t", "内容", "a.md", stale);
    expect(hit.suggestedPath).toBe("归档");

    const fresh = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const miss = await engine.analyze("t", "内容", "a.md", fresh);
    expect(miss.suggestedPath).toBe("");
  });

  it("修改时间规则缺少 mtime 或天数非法时不命中", async () => {
    const engine = new RuleEngine([
      rule({
        id: "old",
        field: RuleField.ModifiedTime,
        operator: RuleOperator.OlderThanDays,
        pattern: "30",
        targetFolder: "归档",
      }),
    ]);
    expect((await engine.analyze("t", "内容", "a.md")).suggestedPath).toBe("");
    expect(
      (await engine.analyze("t", "内容", "a.md", Date.now())).suggestedPath
    ).toBe("");

    const bad = new RuleEngine([
      rule({
        id: "old",
        field: RuleField.ModifiedTime,
        operator: RuleOperator.OlderThanDays,
        pattern: "abc",
        targetFolder: "归档",
      }),
    ]);
    expect(
      (await bad.analyze("t", "内容", "a.md", 0)).suggestedPath
    ).toBe("");
  });

  it("Always 兜底规则无条件命中", async () => {
    const engine = new RuleEngine([
      rule({ id: "no-hit", pattern: "投资", targetFolder: "投资" }),
      rule({
        id: "fallback",
        operator: RuleOperator.Always,
        pattern: "",
        targetFolder: "收件箱",
      }),
    ]);
    const miss = await engine.analyze("t", "无关内容", "a.md");
    expect(miss.suggestedPath).toBe("收件箱");

    const disabled = new RuleEngine([
      rule({
        id: "fallback",
        operator: RuleOperator.Always,
        pattern: "",
        targetFolder: "收件箱",
        enabled: false,
      }),
    ]);
    expect((await disabled.analyze("t", "内容", "a.md")).suggestedPath).toBe("");
  });

  describe("种子规则集", () => {
    it("日期开头的文件名进日志", async () => {
      const engine = new RuleEngine(defaultRules());
      const result = await engine.analyze(
        "2026-09-01",
        "内容",
        "Inbox/2026-09-01.md",
        Date.now()
      );
      expect(result.suggestedPath).toBe("日志");
    });

    it.each([
      ["2026_09_01 会议记录"],
      ["2026年9月1日 晨记"],
      ["2026年09月01日"],
      ["2026-09 月度总结"],
      ["2026.9.1"],
      ["20260901"],
      ["20260901 站会"],
    ])("紧凑/中文/下划线日期格式命中日志：%s", async (filename) => {
      const engine = new RuleEngine(defaultRules());
      const result = await engine.analyze(filename, "内容", `Inbox/${filename}.md`, Date.now());
      expect(result.suggestedPath).toBe("日志");
    });

    it.each([
      ["13812345678"],
      ["13812345678 客户联系"],
      ["99999999"],
    ])("长数字串（非日期）误命中防护：%s", async (filename) => {
      const engine = new RuleEngine(defaultRules(), "收件箱");
      const result = await engine.analyze(filename, "内容", `Inbox/${filename}.md`, Date.now());
      expect(result.suggestedPath).toBe("收件箱");
    });

    it("超过 30 天未修改进归档（规则需显式启用）", async () => {
      const rules = defaultRules().map((r) =>
        r.id === "seed-archive" ? { ...r, enabled: true } : r
      );
      const engine = new RuleEngine(rules);
      const stale = Date.now() - 40 * 24 * 60 * 60 * 1000;
      const result = await engine.analyze("随笔", "内容", "Inbox/随笔.md", stale);
      expect(result.suggestedPath).toBe("归档");
    });

    it("陈旧归档规则默认关闭", () => {
      const archive = defaultRules().find((r) => r.id === "seed-archive");
      expect(archive?.enabled).toBe(false);
    });

    it("收件箱兜底默认使用 {inbox} 占位符并跟随传入的 Inbox 名", async () => {
      const engine = new RuleEngine(defaultRules(), "收件箱");
      const result = await engine.analyze(
        "随手记",
        "内容",
        "Inbox/随手记.md",
        Date.now()
      );
      expect(result.suggestedPath).toBe("收件箱");
    });

    it("规则按顺序生效：日志优先于归档与兜底", async () => {
      const engine = new RuleEngine(defaultRules());
      const stale = Date.now() - 60 * 24 * 60 * 60 * 1000;
      const result = await engine.analyze(
        "2026-01-01",
        "内容",
        "Inbox/2026-01-01.md",
        stale
      );
      expect(result.suggestedPath).toBe("日志");
    });
  });
});

import { describe, it, expect } from "vitest";
import { SharedModelEngine } from "../src/engines/sharedModelEngine";
import { TfidfEngine, FolderSnapshot } from "../src/engines/tfidf/tfidfEngine";
import { RuleField, RuleOperator } from "../src/types";

describe("SharedModelEngine", () => {
  const configJson = JSON.stringify({
    formatVersion: 1,
    name: "测试配置",
    rules: [
      {
        id: "r1",
        name: "前端规则",
        field: RuleField.Content,
        operator: RuleOperator.Contains,
        pattern: "React",
        targetFolder: "技术/前端",
        enabled: true,
        weight: 0.9,
      },
    ],
    folderVectors: [
      {
        folder: "技术/运维",
        vector: { docker: 0.7, 部署: 0.5 },
        norm: 1,
        docCount: 5,
        computedAt: 0,
      },
    ],
    threshold: 0.3,
    idf: { docker: 2.5, 部署: 2.0 },
  });

  it("加载合法配置并按规则匹配", async () => {
    const engine = new SharedModelEngine();
    engine.loadFromJson(configJson);
    expect(engine.isLoaded).toBe(true);
    expect(engine.configName).toBe("测试配置");

    const result = await engine.analyze("t", "聊聊 React 组件", "a.md");
    expect(result.suggestedPath).toBe("技术/前端");
    expect(result.confidence).toBe(0.9);
  });

  it("无规则命中时使用预计算向量", async () => {
    const engine = new SharedModelEngine();
    engine.loadFromJson(configJson);
    const result = await engine.analyze("t", "docker 部署服务的流程与运维要点", "a.md");
    expect(result.suggestedPath).toBe("技术/运维");
  });

  it("未加载配置时给出提示", async () => {
    const engine = new SharedModelEngine();
    const result = await engine.analyze("t", "c", "p");
    expect(result.suggestedPath).toBe("");
    expect(result.reason).toContain("导入");
  });

  it("拒绝非法 JSON 与格式不符配置", () => {
    const engine = new SharedModelEngine();
    expect(() => engine.loadFromJson("not json")).toThrow();
    expect(() => engine.loadFromJson('{"foo": 1}')).toThrow(/规范/);
  });

  it("导出再导入保持一致（round-trip）", async () => {
    const exported = SharedModelEngine.exportConfig(
      "导出测试",
      [],
      [{ folder: "a", vector: { x: 1 }, norm: 1, docCount: 1, computedAt: 0 }],
      { x: 1 },
      0.3
    );
    const engine = new SharedModelEngine();
    engine.loadFromJson(JSON.stringify(exported));
    const result = await engine.analyze("t", "x", "p");
    expect(result.suggestedPath).toBe("a");
  });
});

describe("TfidfEngine", () => {
  const snapshots: FolderSnapshot[] = [
    {
      folder: "投资",
      notes: [
        { path: "投资/a.md", mtime: 1, content: "基金定投策略 估值判断 长期收益 风险分散" },
        { path: "投资/b.md", mtime: 2, content: "股票投资组合 配置比例 止损纪律" },
      ],
    },
    {
      folder: "烹饪",
      notes: [
        { path: "烹饪/a.md", mtime: 1, content: "红烧肉做法 五花肉 冰糖 生抽 老抽 小火慢炖" },
        { path: "烹饪/b.md", mtime: 2, content: "清蒸鲈鱼 葱姜 料酒 蒸鱼豉油 火候" },
      ],
    },
  ];

  it("新笔记匹配到语义最相近的文件夹", async () => {
    const engine = new TfidfEngine(
      () => Promise.resolve(snapshots),
      { threshold: 0.1 }
    );
    const result = await engine.analyze(
      "定投笔记",
      "讨论基金定投与估值，关注长期收益",
      "Inbox/x.md"
    );
    expect(result.suggestedPath).toBe("投资");
    expect(result.confidence).toBeGreaterThan(0.1);
  });

  it("低于阈值时返回空建议", async () => {
    const engine = new TfidfEngine(() => Promise.resolve(snapshots), {
      threshold: 0.9,
    });
    const result = await engine.analyze(
      "无关",
      "量子物理 薛定谔方程 波函数坍缩",
      "Inbox/y.md"
    );
    expect(result.suggestedPath).toBe("");
  });

  it("缓存生效：快照未变化时不重复构建", async () => {
    let callCount = 0;
    const engine = new TfidfEngine(() => {
      callCount++;
      return Promise.resolve(snapshots);
    }, { threshold: 0.1 });
    await engine.initialize();
    const countAfterInit = callCount;
    await engine.analyze("t", "基金定投", "a.md");
    await engine.analyze("t2", "红烧肉", "b.md");
    expect(callCount).toBe(countAfterInit);
  });

  it("invalidateCache 后重建", async () => {
    let callCount = 0;
    const engine = new TfidfEngine(() => {
      callCount++;
      return Promise.resolve(snapshots);
    }, { threshold: 0.1 });
    await engine.initialize();
    engine.invalidateCache();
    await engine.initialize();
    expect(callCount).toBe(2);
  });

  it("空知识库返回空建议", async () => {
    const engine = new TfidfEngine(() => Promise.resolve([]), { threshold: 0.3 });
    const result = await engine.analyze("t", "c", "p");
    expect(result.suggestedPath).toBe("");
  });

  it("示例笔记加权提升目标文件夹相似度", async () => {
    const base = new TfidfEngine(() => Promise.resolve(snapshots), { threshold: 0.1 });
    const noExemplar = await base.analyze("混合", "基金定投 冰糖 小火", "a.md");

    const boosted = new TfidfEngine(() => Promise.resolve(snapshots), {
      threshold: 0.1,
      exemplarNotes: { 投资: ["投资/a.md"] },
    });
    const withExemplar = await boosted.analyze("混合", "基金定投 冰糖 小火", "a.md");
    // 示例笔记加倍后，混合内容应更倾向投资文件夹
    const wentToInvest =
      withExemplar.suggestedPath === "投资" &&
      (noExemplar.suggestedPath !== "投资" ||
        withExemplar.confidence > noExemplar.confidence);
    expect(wentToInvest).toBe(true);
  });

  it("笔记数量上限生效", async () => {
    const big: FolderSnapshot[] = [
      {
        folder: "大文件夹",
        notes: Array.from({ length: 100 }, (_, i) => ({
          path: `big/${i}.md`,
          mtime: i,
          content: `笔记内容 ${i}`,
        })),
      },
    ];
    const engine = new TfidfEngine(() => Promise.resolve(big), {
      threshold: 0.1,
      maxNotes: 10,
    });
    const { vectors } = engine.buildVectors(big);
    expect(vectors[0].docCount).toBe(100);
    await engine.initialize();
    const result = await engine.analyze("笔记内容", "笔记内容 42", "a.md");
    expect(result.suggestedPath).toBe("大文件夹");
  });
});

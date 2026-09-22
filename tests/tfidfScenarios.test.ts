import { describe, it, expect } from "vitest";
import {
  TfidfEngine,
  FolderSnapshot,
} from "../src/engines/tfidf/tfidfEngine";
import { EngineDispatcher } from "../src/scheduler/dispatcher";
import { RuleEngine } from "../src/engines/ruleEngine";
import {
  EngineLevel,
  OrganizeRule,
  RuleField,
  RuleOperator,
} from "../src/types";

/** 构造文件夹快照：每个 content 一篇笔记 */
function snap(folder: string, contents: string[]): FolderSnapshot {
  return {
    folder,
    notes: contents.map((content, i) => ({
      path: `${folder}/n${i}.md`,
      mtime: i,
      content,
    })),
  };
}

function makeEngine(
  snapshots: FolderSnapshot[],
  options: { threshold?: number; maxNotes?: number } = {}
): TfidfEngine {
  return new TfidfEngine(() => Promise.resolve(snapshots), {
    threshold: options.threshold ?? 0.2,
    maxNotes: options.maxNotes,
  });
}

describe("TF-IDF 场景矩阵：语言与分词", () => {
  const corpus = [
    snap("投资", [
      "基金定投策略与估值判断，关注长期收益与风险分散",
      "股票投资组合配置比例与止损纪律",
      "债券市场流动性分析与利率走势研判",
      "资产配置再平衡方法论与再投资策略",
    ]),
    snap("烹饪", [
      "红烧肉做法：五花肉焯水，冰糖生抽老抽上色，小火慢炖收汁",
      "清蒸鲈鱼：葱姜料酒去腥，蒸鱼豉油提鲜，掌握火候",
      "红烧排骨与红烧肉的腌制区别，食材预处理技巧",
      "家常菜调味比例：生抽老抽冰糖的黄金配比",
    ]),
  ];

  it("中文长文匹配正确文件夹", async () => {
    const result = await makeEngine(corpus).analyze(
      "九月定投复盘",
      "本季度继续执行基金定投策略，重点复核估值判断依据；同时讨论资产配置的再平衡节奏与止损纪律的执行情况。",
      "Inbox/a.md"
    );
    expect(result.suggestedPath).toBe("投资");
  });

  it("纯英文语料含词干化匹配", async () => {
    const en = [
      snap("Work", [
        "weekly meeting notes with project updates and action items",
        "project planning document with milestones and deadlines",
        "team sync notes and retrospective action items",
      ]),
      snap("Recipes", [
        "pasta recipe with tomato sauce and garlic",
        "chocolate cake recipe with butter and cocoa",
        "salad dressing recipe with olive oil",
      ]),
    ];
    const result = await makeEngine(en).analyze(
      "meeting note",
      "meeting note about project planning and action items",
      "Inbox/b.md"
    );
    expect(result.suggestedPath).toBe("Work");
  });

  it("中英混排技术笔记命中前端文件夹", async () => {
    const mix = [
      snap("前端", [
        "React 组件设计：hooks 状态管理与性能优化",
        "组件通信与路由配置实践",
        "React 状态管理方案对比与选型",
      ]),
      snap("后端", [
        "数据库索引优化与查询性能调优",
        "缓存策略与消息队列实践",
        "服务端接口设计与并发处理",
      ]),
    ];
    const result = await makeEngine(mix).analyze(
      "hook 笔记",
      "记录 React hooks 在状态管理中的使用心得与性能优化技巧",
      "Inbox/c.md"
    );
    expect(result.suggestedPath).toBe("前端");
  });

  it("全新领域生词正确拒绝", async () => {
    const result = await makeEngine(corpus, { threshold: 0.3 }).analyze(
      "物理笔记",
      "量子纠缠实验设计与贝尔不等式验证，讨论波函数坍缩解释",
      "Inbox/d.md"
    );
    expect(result.suggestedPath).toBe("");
  });

  it("纯代码块笔记因内容过短被拒绝", async () => {
    const result = await makeEngine(corpus).analyze(
      "代码片段",
      "```js\nfunction calc(list) { return list.reduce((a, b) => a + b, 0); }\n```",
      "Inbox/e.md"
    );
    expect(result.suggestedPath).toBe("");
  });

  it("日期数字主导的笔记正确拒绝", async () => {
    const result = await makeEngine(corpus, { threshold: 0.3 }).analyze(
      "日期",
      "2024-01-01 2024-01-02 2024-01-03 2024-01-04",
      "Inbox/f.md"
    );
    expect(result.suggestedPath).toBe("");
  });

  it("模板化重复前缀被稀释，内容主题主导归属", async () => {
    const tpl = "日期：今天 天气：晴 心情：平稳 ";
    const templated = [
      snap("项目", [
        tpl + "需求评审会议纪要与排期更新",
        tpl + "接口联调进度与阻塞问题记录",
      ]),
      snap("旅行", [
        tpl + "京都行程规划：景点门票与当地交通",
        tpl + "行李清单与汇率兑换注意事项",
      ]),
    ];
    const result = await makeEngine(templated).analyze(
      "出行记录",
      tpl + "大阪行程规划与景点门票预订",
      "Inbox/g.md"
    );
    expect(result.suggestedPath).toBe("旅行");
  });

  it("短中文笔记的阈值敏感性：低阈值收录、高阈值拒绝", async () => {
    const engine = makeEngine(corpus, { threshold: 0.2 });
    const low = await engine.analyze("投资随记", "聊聊基金定投与估值", "Inbox/h.md");
    expect(low.suggestedPath).toBe("投资");

    const strict = makeEngine(corpus, { threshold: 0.85 });
    const high = await strict.analyze("投资随记", "聊聊基金定投与估值", "Inbox/h.md");
    expect(high.suggestedPath).toBe("");
  });
});

describe("TF-IDF 场景矩阵：库结构与规模", () => {
  it("空库明确拒绝", async () => {
    const result = await makeEngine([], { threshold: 0.3 }).analyze("t", "c", "p");
    expect(result.suggestedPath).toBe("");
    expect(result.reason).toContain("文件夹特征");
  });

  it("冷启动单篇文件夹可命中", async () => {
    const corpus = [
      snap("新领域", ["区块链共识机制与权益证明的安全性分析"]),
      snap("旧领域", ["传统数据库事务隔离级别与锁机制"]),
    ];
    const result = await makeEngine(corpus, { threshold: 0.3 }).analyze(
      "共识",
      "权益证明共识机制的安全性讨论",
      "Inbox/i.md"
    );
    expect(result.suggestedPath).toBe("新领域");
  });

  it("相近主题双文件夹按词汇区分", async () => {
    const corpus = [
      snap("前端开发", [
        "React 组件与 CSS 样式方案，浏览器渲染性能优化",
        "前端构建工具与类型检查配置",
      ]),
      snap("后端开发", [
        "服务端缓存与消息队列，数据库性能优化",
        "后端接口网关与负载均衡配置",
      ]),
    ];
    const result = await makeEngine(corpus).analyze(
      "渲染优化",
      "浏览器渲染性能优化与组件样式方案调研",
      "Inbox/j.md"
    );
    expect(result.suggestedPath).toBe("前端开发");
  });

  it("深层级树中精确子文件夹胜出", async () => {
    const corpus = [
      snap("技术", ["技术选型方法论与团队协作规范"]),
      snap("技术/前端", [
        "React 组件设计与 hooks 状态管理",
        "前端性能优化与构建工具链",
      ]),
    ];
    const result = await makeEngine(corpus).analyze(
      "组件笔记",
      "React 组件状态管理与性能优化实践",
      "Inbox/k.md"
    );
    expect(result.suggestedPath).toBe("技术/前端");
  });

  it("杂物收件箱在语料中也不会干扰强匹配", async () => {
    const corpus = [
      snap("投资", [
        "基金定投策略与估值判断，关注长期收益",
        "股票组合配置与止损纪律",
      ]),
      snap("烹饪", ["红烧肉做法与腌制技巧", "清蒸鱼火候与调味"]),
      snap("收件箱", [
        "基金定投 红烧肉 行程 杂记",
        "待办 清单 随手记 想法",
      ]),
    ];
    const result = await makeEngine(corpus).analyze(
      "定投",
      "基金定投策略与估值判断复盘",
      "收件箱/l.md"
    );
    expect(result.suggestedPath).toBe("投资");
  });
});

describe("TF-IDF 场景矩阵：内容形态", () => {
  const corpus = [
    snap("投资", [
      "基金定投策略与估值判断，关注长期收益与风险分散",
      "股票投资组合配置比例与止损纪律",
      "债券市场流动性分析与利率走势研判",
      "资产配置再平衡方法论与再投资策略",
    ]),
    snap("烹饪", [
      "红烧肉做法：五花肉焯水，冰糖生抽老抽上色，小火慢炖收汁",
      "清蒸鲈鱼：葱姜料酒去腥，蒸鱼豉油提鲜，掌握火候",
    ]),
  ];

  it("超长笔记正常参与匹配", async () => {
    const long = ("今天的市场复盘：" + "基金定投与估值判断的长期逻辑，风险分散纪律。").repeat(60);
    const result = await makeEngine(corpus).analyze("复盘", long, "Inbox/m.md");
    expect(result.suggestedPath).toBe("投资");
  });

  it("极短笔记命中词汇重合的文件夹", async () => {
    const shopping = [
      snap("购物清单", ["买牛奶 买鸡蛋 买面包", "买洗衣液 买纸巾"]),
      snap("技术", ["React 组件设计", "数据库索引优化"]),
    ];
    const result = await makeEngine(shopping, { threshold: 0.2 }).analyze(
      "购物",
      "买牛奶",
      "Inbox/n.md"
    );
    expect(result.suggestedPath).toBe("购物清单");
  });

  it("空内容与纯图片笔记被拒绝", async () => {
    const engine = makeEngine(corpus);
    const empty = await engine.analyze("空", "", "Inbox/o.md");
    expect(empty.suggestedPath).toBe("");
    const image = await engine.analyze("图", "![](attachments/pic.png)", "Inbox/p.md");
    expect(image.suggestedPath).toBe("");
  });

  it("两文件夹内容相同时并列取遍历序在前者", async () => {
    const same = ["相同的内容 主题词汇 甲乙丙丁"];
    const corpus = [snap("甲文件夹", same), snap("乙文件夹", same)];
    const result = await makeEngine(corpus, { threshold: 0.1 }).analyze(
      "t",
      "相同的内容 主题词汇 甲乙丙丁",
      "Inbox/q.md"
    );
    expect(result.suggestedPath).toBe("甲文件夹");
  });
});

describe("TF-IDF 场景矩阵：预算分配与降级链", () => {
  it("maxNotes 按文件夹比例分配，无文件夹失语", async () => {
    const big = Array.from({ length: 600 }, (_, i) => `通用笔记 第${i}篇 正文内容`);
    const corpus: FolderSnapshot[] = [
      snap("大文件夹", big),
      snap("小一", Array.from({ length: 10 }, (_, i) => `小众词汇甲${i} 乙丙丁`)),
      snap("小二", Array.from({ length: 10 }, (_, i) => `另外词汇戊${i} 己庚辛`)),
    ];
    const engine = makeEngine(corpus, { threshold: 0.2, maxNotes: 500 });
    await engine.initialize();
    const vectors = engine.getVectors();
    expect(vectors.map((v) => v.folder).sort()).toEqual(["大文件夹", "小一", "小二"].sort());
    const totalDocs = vectors.reduce((s, v) => s + v.docCount, 0);
    expect(totalDocs).toBe(500);
    for (const v of vectors) expect(v.docCount).toBeGreaterThan(0);
    const bigVector = vectors.find((v) => v.folder === "大文件夹");
    expect(bigVector!.docCount).toBeGreaterThan(400);
  });

  it("maxNotes 未超限时全量保留", async () => {
    const corpus: FolderSnapshot[] = [
      snap("甲", ["内容一", "内容二", "内容三"]),
      snap("乙", ["内容四", "内容五"]),
    ];
    const engine = makeEngine(corpus, { threshold: 0.2, maxNotes: 100 });
    await engine.initialize();
    const vectors = engine.getVectors();
    expect(vectors.find((v) => v.folder === "甲")!.docCount).toBe(3);
    expect(vectors.find((v) => v.folder === "乙")!.docCount).toBe(2);
  });

  it("集成：层级二 TF-IDF 弃权后规则兜底接管", async () => {
    const tfidf = makeEngine(
      [
        snap("投资", ["基金定投策略与估值判断"]),
        snap("烹饪", ["红烧肉做法与腌制技巧"]),
      ],
      { threshold: 0.99 }
    );
    const rule: OrganizeRule = {
      id: "r1",
      name: "日志归位",
      field: RuleField.Filename,
      operator: RuleOperator.Contains,
      pattern: "2026",
      targetFolder: "日志",
      enabled: true,
    };
    const dispatcher = new EngineDispatcher();
    dispatcher.register(tfidf);
    dispatcher.register(new RuleEngine([rule]));
    const { suggestion, degradedFrom } = await dispatcher.analyzeWithFallback(
      "2026-09-21 随记",
      "今天的流水账",
      "Inbox/2026-09-21 随记.md",
      EngineLevel.Tfidf
    );
    expect(suggestion?.suggestedPath).toBe("日志");
    expect(suggestion?.engine).toBe(EngineLevel.Rules);
    expect(degradedFrom).toBe(EngineLevel.Tfidf);
  });
});

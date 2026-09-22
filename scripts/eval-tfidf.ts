/**
 * TF-IDF 引擎离线评测 harness（不依赖 Obsidian）
 *
 * 方法：合成多领域语料 + 留出法（测试笔记独立生成）+ 阈值扫描。
 * 指标：域内 Top-1 准确率、域内误拒率、域外正确拒绝率、域外误投率、耗时。
 *
 * 运行：
 *   npx esbuild scripts/eval-tfidf.ts --bundle --platform=node \
 *     --outfile=/tmp/opencode/eval-tfidf.js && node /tmp/opencode/eval-tfidf.js
 */
import { TfidfEngine, FolderSnapshot } from "../src/engines/tfidf/tfidfEngine";

/** 确定性伪随机（mulberry32），保证评测可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 六个领域词表（2-4 字词，分词后为 2-3 个 bigram） */
const DOMAINS: { folder: string; vocab: string[] }[] = [
  {
    folder: "投资理财",
    vocab: ["基金定投", "估值判断", "长期收益", "风险分散", "资产配置", "止损纪律", "债券利率", "再平衡", "指数仓位"],
  },
  {
    folder: "烹饪食谱",
    vocab: ["红烧肉", "五花肉", "冰糖生抽", "清蒸鲈鱼", "葱姜料酒", "小火慢炖", "收汁调味", "食材腌制", "火候掌握"],
  },
  {
    folder: "健身训练",
    vocab: ["力量训练", "深蹲硬拉", "组间休息", "蛋白质摄入", "增肌减脂", "有氧跑步", "训练计划", "肌肉恢复", "重量递增"],
  },
  {
    folder: "旅行攻略",
    vocab: ["行程规划", "机票酒店", "签证材料", "景点门票", "当地交通", "行李清单", "汇率兑换", "旅行保险", "口岸通关"],
  },
  {
    folder: "前端开发",
    vocab: ["组件状态", "性能优化", "构建工具", "类型检查", "路由配置", "样式方案", "浏览器渲染", "组件通信", "打包体积"],
  },
  {
    folder: "摄影后期",
    vocab: ["曝光补偿", "白平衡", "色彩分级", "镜头焦段", "三脚架", "降噪锐化", "构图法则", "光圈快门", "直方图"],
  },
];

/** 跨领域噪声词（所有领域共享，IDF 走低，起稀释作用） */
const NOISE = [
  "今天", "记录", "一下", "感觉", "其实", "然后", "问题", "想法",
  "备注", "整理", "内容", "时间", "情况", "方面", "过程", "结果",
];

interface Generated {
  snapshots: FolderSnapshot[];
  /** 域内测试笔记 */
  inDomain: { folder: string; text: string }[];
  /** 域外测试笔记（纯噪声，应被拒绝） */
  outOfDomain: string[];
}

function pick(rng: () => number, arr: string[]): string {
  return arr[Math.floor(rng() * arr.length)];
}

/** 生成一篇笔记：domain 词采样 + 噪声词混入 */
function makeNote(
  rng: () => number,
  vocab: string[],
  opt: { len: number; noiseRatio: number }
): string {
  const parts: string[] = [];
  for (let i = 0; i < opt.len; i++) {
    parts.push(
      rng() < opt.noiseRatio ? pick(rng, NOISE) : pick(rng, vocab)
    );
  }
  return parts.join("，") + "。";
}

function generate(seed: number): Generated {
  const rng = mulberry32(seed);
  const snapshots: FolderSnapshot[] = [];
  const inDomain: { folder: string; text: string }[] = [];
  for (const { folder, vocab } of DOMAINS) {
    // 训练集：30 篇，噪声比例 30%
    const notes = Array.from({ length: 30 }, (_, i) => ({
      path: `${folder}/t${i}.md`,
      mtime: i,
      content: makeNote(rng, vocab, { len: 8 + Math.floor(rng() * 12), noiseRatio: 0.3 }),
    }));
    snapshots.push({ folder, notes });
    // 域内测试集：12 篇独立生成（留出法）
    for (let i = 0; i < 12; i++) {
      inDomain.push({ folder, text: makeNote(rng, vocab, { len: 6 + Math.floor(rng() * 10), noiseRatio: 0.3 }) });
    }
  }
  // 域外测试集：60 篇纯噪声
  const outOfDomain = Array.from({ length: 60 }, () =>
    makeNote(rng, NOISE, { len: 10 + Math.floor(rng() * 8), noiseRatio: 1 })
  );
  return { snapshots, inDomain, outOfDomain };
}

interface Metrics {
  threshold: number;
  accuracy: number;
  falseRefusal: number;
  outRefusal: number;
  outMisroute: number;
}

async function main(): Promise<void> {
  const { snapshots, inDomain, outOfDomain } = generate(20260922);
  const totalTrain = snapshots.reduce((s, f) => s + f.notes.length, 0);
  console.log(`语料：${DOMAINS.length} 领域 × 30 篇训练 = ${totalTrain} 篇；测试：域内 ${inDomain.length} + 域外 ${outOfDomain.length}\n`);

  const t0 = performance.now();
  const engine = new TfidfEngine(() => Promise.resolve(snapshots), { threshold: 0.3 });
  await engine.initialize();
  const buildMs = performance.now() - t0;
  console.log(`语料构建耗时：${buildMs.toFixed(0)}ms\n`);

  const metrics: Metrics[] = [];
  let analyzeMsSum = 0;
  let analyzeCount = 0;

  for (let th = 0.1; th <= 0.9001; th += 0.05) {
    engine.setOptions({ threshold: Number(th.toFixed(2)) });
    let hit = 0;
    let refuseIn = 0;
    let refuseOut = 0;
    let misrouteOut = 0;
    for (const note of inDomain) {
      const t = performance.now();
      const r = await engine.analyze("测试", note.text, "Inbox/x.md");
      analyzeMsSum += performance.now() - t;
      analyzeCount++;
      if (r.suggestedPath === note.folder) hit++;
      else if (r.suggestedPath === "") refuseIn++;
    }
    for (const text of outOfDomain) {
      const r = await engine.analyze("测试", text, "Inbox/y.md");
      if (r.suggestedPath === "") refuseOut++;
      else misrouteOut++;
    }
    metrics.push({
      threshold: Number(th.toFixed(2)),
      accuracy: hit / inDomain.length,
      falseRefusal: refuseIn / inDomain.length,
      outRefusal: refuseOut / outOfDomain.length,
      outMisroute: misrouteOut / outOfDomain.length,
    });
  }

  console.log("阈值   域内准确率   域内误拒   域外正确拒绝   域外误投");
  for (const m of metrics) {
    console.log(
      `${m.threshold.toFixed(2)}   ${(m.accuracy * 100).toFixed(0).padStart(6)}%   ` +
        `${(m.falseRefusal * 100).toFixed(0).padStart(6)}%   ` +
        `${(m.outRefusal * 100).toFixed(8).slice(0, 6)}%        ` +
        `${(m.outMisroute * 100).toFixed(0).padStart(6)}%`
    );
  }

  const avgMs = analyzeMsSum / analyzeCount;
  console.log(`\n单篇分析平均耗时：${avgMs.toFixed(2)}ms（共 ${analyzeCount} 次调用）`);
}

void main();

import { EngineLevel, OrganizeRule, OllamaSettings } from "../types";
import { defaultRules } from "../engines/ruleEngine";

/** 实时归档模式：关闭 / 只提醒（文件不动） / 直接归档（静默移动） */
export enum AutoOrganizeMode {
  Off = 0,
  Notify = 1,
  Move = 2,
}

/** 插件整体设置 */
export interface SmartNotesSettings {
  /** 当前启用的引擎层级 */
  engineLevel: EngineLevel;

  /** 层级一：规则列表（按顺序即优先级） */
  rules: OrganizeRule[];

  /** 层级二：相似度阈值 */
  tfidfThreshold: number;
  /** 层级二：参与计算的笔记上限 */
  tfidfMaxNotes: number;
  /** 层级二：示例笔记 folder -> 笔记路径列表 */
  exemplarNotes: Record<string, string[]>;

  /** 层级三：Ollama 设置 */
  ollama: OllamaSettings;

  /** 层级四：共享配置 JSON 原文（持久化在 data.json） */
  sharedConfigJson: string;
  /** 层级四：导入的配置是否作为规则叠加到当前引擎（叠加 = 失败时作为备选） */
  sharedConfigOverlay: boolean;

  // ---- 通用设置 ----
  /** 实时归档模式（旧 autoOrganize 布尔值迁移后移除） */
  autoOrganizeMode: AutoOrganizeMode;
  /** 实时归档静默期（秒）：笔记静默满此时长才评估归档；0 = 立即（原行为） */
  autoOrganizeDelaySec: number;
  /** 静默期队列：路径 -> 最后活动时间（ms），延迟模式下持久化以便重启恢复计时 */
  delayQueue: Record<string, number>;
  /** 界面语言 */
  locale: "zh" | "en" | "auto";
  /** 设置面板上次停留的分页 */
  lastSettingsTab: string;
  /** Inbox 文件夹名 */
  inboxFolder: string;
  /** 未匹配时的目标文件夹（空 = 保留原位） */
  unclassifiedFolder: string;
  /** 排除的文件夹列表 */
  excludedFolders: string[];
  /** 忽略的文件扩展名（附件等） */
  ignoredExtensions: string[];
  /** 是否记录整理日志 */
  enableLog: boolean;
  /** 一次性迁移标记：0.3.5 种子规则修正（{inbox} 占位符 + 停用陈旧归档）是否已执行 */
  legacySeedMigrated: boolean;
}

export const DEFAULT_SETTINGS: SmartNotesSettings = {
  engineLevel: EngineLevel.Rules,
  rules: defaultRules(),
  tfidfThreshold: 0.3,
  tfidfMaxNotes: 500,
  exemplarNotes: {},
  ollama: {
    address: "http://localhost:11434",
    model: "qwen2.5:7b",
    timeoutMs: 30000,
    fallback: true,
  },
  sharedConfigJson: "",
  sharedConfigOverlay: false,

  autoOrganizeMode: AutoOrganizeMode.Move,
  autoOrganizeDelaySec: 0,
  delayQueue: {},
  locale: "auto",
  lastSettingsTab: "quickstart",
  inboxFolder: "Inbox",
  unclassifiedFolder: "",
  excludedFolders: [".obsidian", ".trash", "模板", "attachments"],
  ignoredExtensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".mp4", ".mp3", ".svg"],
  enableLog: true,
  legacySeedMigrated: false,
};

/**
 * 旧版设置迁移：autoOrganize 布尔值 → autoOrganizeMode 三态。
 * true → Move（保持既有静默移动行为），false → Off；非法值回落 Off。
 * 纯函数：输入原始 data.json 对象，输出补齐默认值的设置，原对象不被修改。
 */
export function migrateSettings(raw: unknown): SmartNotesSettings {
  const base = { ...DEFAULT_SETTINGS, rules: defaultRules() };
  if (typeof raw !== "object" || raw === null) return base;
  const o = raw as Record<string, unknown>;

  // 迁移旧布尔开关（true → Move 保持既有静默移动行为，false → Off）
  if (typeof o.autoOrganize === "boolean") {
    base.autoOrganizeMode = o.autoOrganize ? AutoOrganizeMode.Move : AutoOrganizeMode.Off;
  }
  // 最终模式值在 assign 前确定：合法的新枚举优先，否则沿用迁移结果
  const migratedMode =
    typeof o.autoOrganizeMode === "number" &&
    Object.values(AutoOrganizeMode).includes(o.autoOrganizeMode as AutoOrganizeMode)
      ? (o.autoOrganizeMode as AutoOrganizeMode)
      : base.autoOrganizeMode;

  const merged = Object.assign(base, o) as SmartNotesSettings;
  merged.autoOrganizeMode = migratedMode;
  delete (merged as unknown as Record<string, unknown>).autoOrganize;
  if (merged.locale !== "zh" && merged.locale !== "en" && merged.locale !== "auto") {
    merged.locale = "auto";
  }
  if (typeof merged.lastSettingsTab !== "string" || !merged.lastSettingsTab) {
    merged.lastSettingsTab = "quickstart";
  }
  if (typeof merged.legacySeedMigrated !== "boolean") {
    merged.legacySeedMigrated = false;
  }
  // 静默期：非法值回落 0（立即）；范围钳制 0~86400 秒（一天）
  if (typeof merged.autoOrganizeDelaySec !== "number" || !Number.isFinite(merged.autoOrganizeDelaySec)) {
    merged.autoOrganizeDelaySec = 0;
  }
  merged.autoOrganizeDelaySec = Math.min(
    86400,
    Math.max(0, Math.round(merged.autoOrganizeDelaySec))
  );
  if (
    typeof merged.delayQueue !== "object" ||
    merged.delayQueue === null ||
    Array.isArray(merged.delayQueue)
  ) {
    merged.delayQueue = {};
  }
  for (const key of Object.keys(merged.delayQueue)) {
    if (typeof merged.delayQueue[key] !== "number" || !Number.isFinite(merged.delayQueue[key])) {
      delete merged.delayQueue[key];
    }
  }
  return merged;
}

/**
 * 一次性种子规则迁移（0.3.5）：
 * 1. 老版种子规则「收件箱兜底」目标硬编码为「收件箱」，与 Inbox 设置脱钩，
 *    会把 Inbox 里的笔记搬进第二个收件箱——改写为 {inbox} 占位符；
 * 2. 「归档陈旧笔记」属时间型破坏性规则，放在兜底链上会归档所有语义弃权的
 *    笔记（复制文件的旧 mtime 也会误触发）——停用并告知用户可重新开启。
 * 幂等：仅当 legacySeedMigrated 为 false 时执行；archiveDisabled 为 true 时
 * 调用方应弹一次性提示。返回值同时携带是否发生迁移，便于测试断言。
 */
export function migrateLegacySeedRules(settings: SmartNotesSettings): {
  migrated: boolean;
  archiveDisabled: boolean;
} {
  if (settings.legacySeedMigrated || !Array.isArray(settings.rules)) {
    return { migrated: false, archiveDisabled: false };
  }
  let migrated = false;
  let archiveDisabled = false;
  for (const rule of settings.rules) {
    if (rule.id === "seed-inbox-fallback" && rule.targetFolder === "收件箱") {
      rule.targetFolder = "{inbox}";
      migrated = true;
    }
    if (rule.id === "seed-archive" && rule.enabled) {
      rule.enabled = false;
      archiveDisabled = true;
      migrated = true;
    }
  }
  settings.legacySeedMigrated = true;
  return { migrated, archiveDisabled };
}

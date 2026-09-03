import { EngineLevel, OrganizeRule, OllamaSettings } from "../types";
import { defaultRules } from "../engines/ruleEngine";

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
  /** 启用自动整理（监听新建/重命名事件） */
  autoOrganize: boolean;
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

  autoOrganize: true,
  inboxFolder: "Inbox",
  unclassifiedFolder: "",
  excludedFolders: [".obsidian", ".trash", "模板", "attachments"],
  ignoredExtensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf", ".mp4", ".mp3", ".svg"],
  enableLog: true,
};

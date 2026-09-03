/**
 * 核心类型定义：四层引擎架构的统一数据模型
 */

/** 引擎层级 */
export enum EngineLevel {
  /** 层级一：规则映射（零门槛） */
  Rules = 1,
  /** 层级二：TF-IDF 轻量智能（无需 AI 模型） */
  Tfidf = 2,
  /** 层级三：本地大模型（需 Ollama） */
  Ollama = 3,
  /** 层级四：社区共享模型配置（零计算） */
  SharedModel = 4,
}

/** 层级一规则：匹配字段 */
export enum RuleField {
  Title = "title",
  Content = "content",
  Tag = "tag",
  Filename = "filename",
  /** 文件修改时间（配合 OlderThanDays 使用） */
  ModifiedTime = "mtime",
}

/** 层级一规则：匹配方式 */
export enum RuleOperator {
  Contains = "contains",
  Equals = "equals",
  Regex = "regex",
  /** 修改时间早于 N 天前（pattern 为天数，如 "30"） */
  OlderThanDays = "older_than_days",
  /** 无条件命中（兜底规则，pattern 留空） */
  Always = "always",
}

/** 层级一：单条规则 */
export interface OrganizeRule {
  id: string;
  /** 规则名称，便于用户识别 */
  name: string;
  field: RuleField;
  operator: RuleOperator;
  /** 匹配模式：文本、精确值或正则表达式 */
  pattern: string;
  /** 目标文件夹（相对 Vault 根目录），如 "02-战略/竞品" */
  targetFolder: string;
  /** 是否启用 */
  enabled: boolean;
  /** 关键词权重（层级四共享配置可携带，层级一默认 1） */
  weight?: number;
}

/** 层级二：文件夹特征向量缓存 */
export interface FolderVector {
  folder: string;
  /** 词 -> TF-IDF 权重 */
  vector: Record<string, number>;
  /** 归一化后的模长，用于余弦相似度快速计算 */
  norm: number;
  /** 参与计算的笔记数量 */
  docCount: number;
  /** 计算时间戳 */
  computedAt: number;
}

/** 层级三：Ollama 设置 */
export interface OllamaSettings {
  address: string;
  model: string;
  /** 请求超时（毫秒） */
  timeoutMs: number;
  /** 失败时是否降级到低层级引擎 */
  fallback: boolean;
}

/** 层级三：Prompt 上下文（标题、正文、现有文件夹结构） */
export interface OllamaPromptContext {
  title: string;
  content: string;
  /** 现有文件夹结构（相对路径数组） */
  folderTree: string[];
}

/** Ollama 引擎错误类型：kind 决定降级策略 */
export class OllamaError extends Error {
  constructor(
    message: string,
    public readonly kind: "unavailable" | "timeout" | "bad_response"
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

/** 层级四：社区共享配置文件格式（JSON） */
export interface SharedModelConfig {
  formatVersion: 1;
  name: string;
  description?: string;
  /** 导出时间 */
  exportedAt?: string;
  /** 规则列表（可带权重） */
  rules: OrganizeRule[];
  /** 预计算的文件夹 TF-IDF 向量 */
  folderVectors: FolderVector[];
  /** 相似度阈值 */
  threshold: number;
  /** 全局 IDF 表（词 -> IDF 值），用于新笔记向量计算 */
  idf: Record<string, number>;
}

/** 引擎分析结果 */
export interface Suggestion {
  /** 建议的目标文件夹（相对 Vault 根目录），空字符串表示建议保留原位 */
  suggestedPath: string;
  /** 置信度 0~1 */
  confidence: number;
  /** 建议理由（人类可读） */
  reason: string;
  /** 产生建议的引擎层级 */
  engine: EngineLevel;
}

/** 所有引擎都必须实现该接口 */
export interface IOrganizeEngine {
  /** 引擎显示名称 */
  readonly name: string;
  readonly level: EngineLevel;
  /**
   * 分析笔记并给出目标文件夹建议
   * @param title 笔记标题（不含扩展名）
   * @param content 笔记正文（Markdown 文本）
   * @param filePath 笔记当前路径
   * @param mtime 文件最后修改时间（毫秒时间戳），供时间类规则使用
   */
  analyze(
    title: string,
    content: string,
    filePath: string,
    mtime?: number
  ): Promise<Suggestion>;
  /** 可选初始化（如扫描文件夹、加载缓存） */
  initialize?(): Promise<void>;
  /** 可选清理 */
  dispose?(): void;
}

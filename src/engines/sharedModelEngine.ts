import {
  IOrganizeEngine,
  Suggestion,
  EngineLevel,
  SharedModelConfig,
  OrganizeRule,
  FolderVector,
} from "../types";
import { matchRule, normalizeFolderPath, isValidSharedConfig } from "../utils/helpers";
import { tfidfVector, cosineSimilarity } from "./tfidf/tfidf";

/**
 * 层级四：社区共享模型引擎
 * 加载由高配用户（层级三配合层级二）导出的分类配置文件：
 * - 规则列表（可带权重）
 * - 预计算的文件夹 TF-IDF 向量与全局 IDF 表
 * 零计算成本即可获得接近 AI 的分类效果。
 */
export class SharedModelEngine implements IOrganizeEngine {
  readonly name = "社区共享配置";
  readonly level = EngineLevel.SharedModel;

  private config: SharedModelConfig | null = null;

  get configName(): string {
    return this.config?.name ?? "";
  }

  get isLoaded(): boolean {
    return this.config !== null;
  }

  /** 从 JSON 字符串加载配置，非法配置抛出异常 */
  loadFromJson(json: string): SharedModelConfig {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("配置文件不是合法的 JSON");
    }
    if (!isValidSharedConfig(parsed)) {
      throw new Error("配置文件格式不符合 SharedModelConfig 规范");
    }
    this.config = {
      formatVersion: 1,
      name: parsed.name,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined,
      rules: parsed.rules as OrganizeRule[],
      folderVectors: parsed.folderVectors as FolderVector[],
      threshold: parsed.threshold,
      idf: parsed.idf,
    };
    return this.config;
  }

  /** 导出共享配置（供高配用户生成社区文件） */
  static exportConfig(
    name: string,
    rules: OrganizeRule[],
    folderVectors: FolderVector[],
    idf: Record<string, number>,
    threshold: number,
    description?: string
  ): SharedModelConfig {
    return {
      formatVersion: 1,
      name,
      description,
      exportedAt: new Date().toISOString(),
      rules,
      folderVectors,
      threshold,
      idf,
    };
  }

  async analyze(
    title: string,
    content: string,
    filePath: string
  ): Promise<Suggestion> {
    if (!this.config) {
      return {
        suggestedPath: "",
        confidence: 0,
        reason: "尚未导入共享配置，请先在设置中导入",
        engine: this.level,
      };
    }

    // 第一步：规则匹配（按配置中的顺序与权重）
    for (const rule of this.config.rules) {
      if (matchRule(rule, title, content, filePath)) {
        return {
          suggestedPath: normalizeFolderPath(rule.targetFolder),
          confidence: Math.min(1, rule.weight ?? 1),
          reason: `共享配置规则「${rule.name}」命中`,
          engine: this.level,
        };
      }
    }

    // 第二步：预计算向量匹配
    const vectors = this.config.folderVectors;
    if (vectors.length === 0) {
      return {
        suggestedPath: "",
        confidence: 0,
        reason: "共享配置中没有可用的文件夹向量",
        engine: this.level,
      };
    }

    const { vector, norm } = tfidfVector(`${title}\n${content}`, this.config.idf);
    if (norm === 0) {
      return {
        suggestedPath: "",
        confidence: 0,
        reason: "笔记内容过短，无法计算特征",
        engine: this.level,
      };
    }

    let best: FolderVector | null = null;
    let bestScore = 0;
    for (const fv of vectors) {
      const score = cosineSimilarity(vector, norm, fv.vector, fv.norm);
      if (score > bestScore) {
        bestScore = score;
        best = fv;
      }
    }

    if (best && bestScore >= this.config.threshold) {
      return {
        suggestedPath: best.folder,
        confidence: Math.round(bestScore * 100) / 100,
        reason: `共享配置：与文件夹「${best.folder}」相似度 ${(bestScore * 100).toFixed(0)}%`,
        engine: this.level,
      };
    }
    return {
      suggestedPath: "",
      confidence: Math.round(bestScore * 100) / 100,
      reason: `共享配置：最高相似度 ${(bestScore * 100).toFixed(0)}% 低于阈值 ${(
        this.config.threshold * 100
      ).toFixed(0)}%`,
      engine: this.level,
    };
  }
}

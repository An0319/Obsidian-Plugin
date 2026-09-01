import {
  IOrganizeEngine,
  Suggestion,
  EngineLevel,
  FolderVector,
} from "../../types";
import { normalizeFolderPath } from "../../utils/helpers";
import { buildIdf, tfidfVector, cosineSimilarity } from "./tfidf";

/** 单个文件夹的快照：包含其下全部笔记 */
export interface FolderSnapshot {
  folder: string;
  notes: { path: string; mtime: number; content: string }[];
}

/** 快照提供者：由上层（main.ts）注入，与 Obsidian API 解耦 */
export type SnapshotProvider = () => Promise<FolderSnapshot[]>;

export interface TfidfEngineOptions {
  /** 余弦相似度阈值，默认 0.3 */
  threshold: number;
  /** 最多参与的笔记数量限制（性能保护），默认 500 */
  maxNotes: number;
  /** 手动标记的示例笔记：folder -> 笔记路径列表，权重加倍 */
  exemplarNotes?: Record<string, string[]>;
}

const DEFAULT_OPTIONS: TfidfEngineOptions = {
  threshold: 0.3,
  maxNotes: 500,
};

/** 缓存有效期（毫秒）：期内 analyze 不重复扫描全库 */
const CACHE_TTL_MS = 60_000;

/**
 * 层级二：轻量智能引擎
 * 基于手写 TF-IDF + 余弦相似度，将新笔记与文件夹特征向量匹配。
 * 纯 TypeScript 零依赖；带 TTL + 签名双层缓存，内容未变更时不重复计算。
 */
export class TfidfEngine implements IOrganizeEngine {
  readonly name = "TF-IDF 智能匹配";
  readonly level = EngineLevel.Tfidf;

  private options: TfidfEngineOptions;
  private cache: FolderVector[] = [];
  private cacheSignature = "";
  private cacheTime = 0;

  constructor(
    private provider: SnapshotProvider,
    options: Partial<TfidfEngineOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setOptions(options: Partial<TfidfEngineOptions>): void {
    this.options = { ...this.options, ...options };
    this.invalidateCache();
  }

  invalidateCache(): void {
    this.cache = [];
    this.cacheSignature = "";
    this.cacheTime = 0;
  }

  /**
   * 基于文件夹快照构建全部文件夹向量（纯计算，供缓存刷新与配置导出复用）
   */
  buildVectors(snapshots: FolderSnapshot[]): {
    vectors: FolderVector[];
    idf: Record<string, number>;
  } {
    // 汇总所有笔记文本用于 IDF（以笔记为文档单元）
    const docs: string[] = [];
    for (const snap of snapshots) {
      for (const note of snap.notes) docs.push(note.content);
    }
    if (docs.length === 0) return { vectors: [], idf: {} };

    const idf = buildIdf(docs);
    const vectors: FolderVector[] = [];

    for (const snap of snapshots) {
      if (snap.notes.length === 0) continue;
      const mergedText = this.mergeFolderText(snap.notes);
      const { vector: normalized, norm } = tfidfVector(mergedText, idf);
      vectors.push({
        folder: normalizeFolderPath(snap.folder),
        vector: normalized,
        norm,
        docCount: snap.notes.length,
        computedAt: Date.now(),
      });
    }
    return { vectors, idf };
  }

  /** 文件夹合并文本（含示例笔记加权） */
  private mergeFolderText(notes: FolderSnapshot["notes"]): string {
    const exemplars = new Set(
      this.options.exemplarNotes?.[this.folderOf(notes[0]?.path ?? "")] ?? []
    );
    const parts: string[] = [];
    for (const note of notes) {
      parts.push(note.content);
      if (exemplars.has(note.path)) {
        parts.push(note.content); // 示例笔记权重加倍
      }
    }
    return parts.join("\n");
  }

  private folderOf(notePath: string): string {
    const idx = notePath.lastIndexOf("/");
    return idx === -1 ? "" : notePath.slice(0, idx);
  }

  /** 当前使用的 IDF 表（ensureCache 时更新，供共享配置导出） */
  private idf: Record<string, number> = {};

  async initialize(): Promise<void> {
    await this.ensureCache();
  }

  /** 获取当前缓存的文件夹向量（供层级四配置导出） */
  getVectors(): FolderVector[] {
    return this.cache;
  }

  /** 获取当前 IDF 表（供层级四配置导出） */
  getIdf(): Record<string, number> {
    return this.idf;
  }

  dispose(): void {
    this.invalidateCache();
    this.idf = {};
  }

  /** 确保缓存可用：TTL 内直接复用；过期后重扫快照并按签名跳过无变化重建 */
  private async ensureCache(): Promise<void> {
    if (
      this.cache.length > 0 &&
      Date.now() - this.cacheTime < CACHE_TTL_MS
    ) {
      return;
    }
    const snapshots = await this.provider();
    const limited = this.limitNotes(snapshots);
    const signature = limited
      .map(
        (s) =>
          `${s.folder}#${s.notes.map((n) => `${n.path}:${n.mtime}`).sort().join(",")}`
      )
      .sort()
      .join("||");
    if (signature === this.cacheSignature && this.cache.length > 0) return;

    const { vectors, idf } = this.buildVectors(limited);
    this.cache = vectors;
    this.idf = idf;
    this.cacheSignature = signature;
    this.cacheTime = Date.now();
  }

  /** 限制参与计算的笔记数量（保留最新的笔记） */
  private limitNotes(snapshots: FolderSnapshot[]): FolderSnapshot[] {
    let budget = this.options.maxNotes;
    const result: FolderSnapshot[] = [];
    for (const snap of snapshots) {
      if (budget <= 0) break;
      const notes = [...snap.notes]
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, budget);
      budget -= notes.length;
      result.push({ folder: snap.folder, notes });
    }
    return result;
  }

  async analyze(
    title: string,
    content: string,
    _filePath: string
  ): Promise<Suggestion> {
    await this.ensureCache();
    if (this.cache.length === 0) {
      return {
        suggestedPath: "",
        confidence: 0,
        reason: "知识库中没有可用的文件夹特征",
        engine: this.level,
      };
    }

    const { vector, norm } = tfidfVector(`${title}\n${content}`, this.idf);
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
    for (const fv of this.cache) {
      const score = cosineSimilarity(vector, norm, fv.vector, fv.norm);
      if (score > bestScore) {
        bestScore = score;
        best = fv;
      }
    }

    if (best && bestScore >= this.options.threshold) {
      return {
        suggestedPath: best.folder,
        confidence: Math.round(bestScore * 100) / 100,
        reason: `与文件夹「${best.folder}」的 ${best.docCount} 篇笔记相似度 ${(
          bestScore * 100
        ).toFixed(0)}%`,
        engine: this.level,
      };
    }
    return {
      suggestedPath: "",
      confidence: Math.round(bestScore * 100) / 100,
      reason:
        bestScore === 0
          ? "无法计算相似度"
          : `最高相似度 ${(bestScore * 100).toFixed(0)}% 低于阈值 ${(
              this.options.threshold * 100
            ).toFixed(0)}%`,
      engine: this.level,
    };
  }
}

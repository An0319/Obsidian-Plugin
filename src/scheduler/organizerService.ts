import { App, TFile } from "obsidian";
import { EngineLevel, Suggestion } from "../types";
import { SmartNotesSettings } from "../settings/settings";
import { EngineDispatcher } from "../scheduler/dispatcher";
import {
  FileOrganizer,
  parentFolder,
} from "../services/fileOrganizer";
import {
  FolderSnapshot,
  SnapshotProvider,
} from "../engines/tfidf/tfidfEngine";

/**
 * 核心整理服务：连接引擎调度器与文件操作层。
 * 提供单文件分析、建议应用、批量整理能力。
 */
export class OrganizerService {
  constructor(
    private app: App,
    private settings: SmartNotesSettings,
    private dispatcher: EngineDispatcher,
    private organizer: FileOrganizer
  ) {}

  updateSettings(settings: SmartNotesSettings): void {
    this.settings = settings;
    this.organizer.updateSettings(settings);
  }

  /** 构建文件夹快照提供者（供层级二使用） */
  snapshotProvider(): SnapshotProvider {
    return async () => {
      const excluded = new Set(
        this.settings.excludedFolders.map((f) => f.trim()).filter(Boolean)
      );
      const folders = new Map<string, FolderSnapshot>();

      for (const file of this.app.vault.getMarkdownFiles()) {
        if (file.extension !== "md") continue;
        const folder = parentFolder(file.path);
        if (isExcluded(file.path, excluded)) continue;
        let snap = folders.get(folder);
        if (!snap) {
          snap = { folder, notes: [] };
          folders.set(folder, snap);
        }
        snap.notes.push({
          path: file.path,
          mtime: file.stat.mtime,
          content: await this.app.vault.read(file),
        });
      }
      return [...folders.values()];
    };
  }

  /** 获取当前知识库文件夹结构（相对路径数组，供层级三 Prompt） */
  folderTree(): string[] {
    const excluded = new Set(
      this.settings.excludedFolders.map((f) => f.trim()).filter(Boolean)
    );
    const folders = new Set<string>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const parts = parentFolder(file.path).split("/").filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        const path = parts.slice(0, i + 1).join("/");
        if (!isExcluded(path, excluded)) folders.add(path);
      }
    }
    return [...folders].sort();
  }

  /** 分析单个文件，返回建议（可能为 null：所有引擎失败） */
  async analyze(file: TFile): Promise<{
    suggestion: Suggestion | null;
    degradedFrom?: EngineLevel;
    error?: string;
  }> {
    const content = await this.app.vault.read(file);
    return this.dispatcher.analyzeWithFallback(
      file.basename,
      content,
      file.path,
      this.settings.engineLevel,
      file.stat.mtime
    );
  }

  /** 应用建议：执行移动并记录日志。返回新路径；建议为空则返回原路径 */
  async apply(file: TFile, suggestion: Suggestion, mode: "auto" | "manual"): Promise<string> {
    let target = suggestion.suggestedPath;
    // 无建议且配置了未归类文件夹时，移入未归类
    if (!target && this.settings.unclassifiedFolder) {
      target = this.settings.unclassifiedFolder;
    }
    if (!target) return file.path;

    const from = file.path;
    const to = await this.organizer.moveToFolder(file, target);
    if (to !== from) {
      await this.organizer.recordMove(
        file,
        from,
        to,
        EngineLevel[suggestion.engine],
        suggestion.reason,
        mode
      );
    }
    return to;
  }

  /** 记录一次弃权：笔记未被移动，理由中带 top3 诊断供日志回溯 */
  async logRefusal(
    file: TFile,
    suggestion: Suggestion,
    mode: "auto" | "manual"
  ): Promise<void> {
    await this.organizer.recordRefusal(
      file,
      file.path,
      EngineLevel[suggestion.engine],
      suggestion.reason,
      mode
    );
  }

  /** 整理单个文件（分析 + 应用） */
  async organizeOne(
    file: TFile,
    mode: "auto" | "manual"
  ): Promise<{ moved: boolean; suggestion: Suggestion | null; newPath?: string; error?: string }> {
    if (this.organizer.shouldIgnore(file)) {
      return { moved: false, suggestion: null };
    }
    const { suggestion, degradedFrom, error } = await this.analyze(file);
    if (!suggestion || !suggestion.suggestedPath) {
      if (error) return { moved: false, suggestion, error };
      if (suggestion) {
        await this.logRefusal(file, suggestion, mode);
      }
      return { moved: false, suggestion };
    }
    void degradedFrom;
    const newPath = await this.apply(file, suggestion, mode);
    return { moved: newPath !== file.path, suggestion, newPath };
  }

  /** 批量整理 Inbox（或全库），返回汇总计数与逐篇明细（供整理报告展示） */
  async organizeInbox(
    mode: "auto" | "manual",
    onProgress?: (done: number, total: number, name: string) => void
  ): Promise<{
    moved: number;
    skipped: number;
    errors: string[];
    entries: BatchEntry[];
  }> {
    const files = this.organizer.listPendingFiles();
    let moved = 0;
    let skipped = 0;
    const errors: string[] = [];
    const entries: BatchEntry[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(i + 1, files.length, file.basename);
      try {
        const from = file.path;
        const result = await this.organizeOne(file, mode);
        entries.push({
          file: file.basename,
          from,
          to: result.newPath ?? "",
          moved: result.moved,
          engine: result.suggestion ? EngineLevel[result.suggestion.engine] : "",
          reason: result.error
            ? result.error
            : result.suggestion
              ? result.suggestion.reason
              : "引擎不可用",
          confidence: result.suggestion?.confidence ?? 0,
          refused: this.isRefusal(result),
        });
        if (result.moved) moved++;
        else skipped++;
        if (result.error) errors.push(`${file.basename}: ${result.error}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file.basename}: ${msg}`);
        entries.push({
          file: file.basename,
          from: file.path,
          to: "",
          moved: false,
          engine: "",
          reason: msg,
          confidence: 0,
        });
      }
    }
    return { moved, skipped, errors, entries };
  }

  /** 弃权判定：有引擎分析结果但拒绝给出目标（排除引擎报错的情况） */
  private isRefusal(result: {
    moved: boolean;
    suggestion: Suggestion | null;
    error?: string;
  }): boolean {
    return (
      !result.moved &&
      !result.error &&
      !!result.suggestion &&
      !result.suggestion.suggestedPath
    );
  }
}

/** 批量整理的逐篇明细条目（整理报告数据源） */
export interface BatchEntry {
  /** 文件名（不含路径） */
  file: string;
  /** 原路径 */
  from: string;
  /** 新路径（未移动时为空） */
  to: string;
  moved: boolean;
  /** 引擎名称（如 Rules / Tfidf），未产生建议时为空 */
  engine: string;
  /** 建议依据 / 保留原因 */
  reason: string;
  confidence: number;
  /** 撤销状态（报告面板运行时管理） */
  undone?: boolean;
  /** true = 引擎弃权未移动（报告面板展示弃权徽标） */
  refused?: boolean;
}

/** 路径是否位于排除文件夹内 */
function isExcluded(path: string, excluded: Set<string>): boolean {
  const parts = path.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    if (excluded.has(parts.slice(0, i + 1).join("/"))) return true;
  }
  return false;
}

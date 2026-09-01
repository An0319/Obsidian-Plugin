import { App, TFile, TFolder, normalizePath } from "obsidian";
import { SmartNotesSettings } from "../settings/settings";

/** 一次整理操作的日志记录 */
export interface OrganizeLogEntry {
  time: string;
  file: string;
  from: string;
  to: string;
  engine: string;
  reason: string;
  mode: "auto" | "manual";
}

const LOG_FILE = "organize-log.json";
const MAX_LOG_ENTRIES = 200;

/**
 * 整理日志：记录每次移动操作，持久化到插件目录。
 * 数据完全本地保存。
 */
export class ActivityLog {
  constructor(private app: App, private dir: string) {}

  private get logPath(): string {
    return normalizePath(`${this.dir}/${LOG_FILE}`);
  }

  async append(entry: OrganizeLogEntry): Promise<void> {
    try {
      const entries = await this.read();
      entries.unshift(entry);
      if (entries.length > MAX_LOG_ENTRIES) entries.length = MAX_LOG_ENTRIES;
      await this.app.vault.adapter.write(
        this.logPath,
        JSON.stringify(entries, null, 2)
      );
    } catch {
      // 日志失败不影响主流程
    }
  }

  async read(): Promise<OrganizeLogEntry[]> {
    try {
      const raw = await this.app.vault.adapter.read(this.logPath);
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

/**
 * 文件整理服务：负责文件夹创建、文件移动与链接更新。
 * 移动使用 app.fileManager.renameFile，由 Obsidian 自动更新所有内部链接。
 */
export class FileOrganizer {
  constructor(
    private app: App,
    private settings: SmartNotesSettings,
    private log: ActivityLog
  ) {}

  updateSettings(settings: SmartNotesSettings): void {
    this.settings = settings;
  }

  /** 是否应忽略该文件（系统/附件/排除文件夹） */
  shouldIgnore(file: TFile): boolean {
    if (file.extension !== "md") return true;
    if (this.settings.ignoredExtensions.includes(`.${file.extension}`))
      return true;
    const parts = file.path.split("/");
    // 命中排除目录（含其子目录）则忽略
    for (const excluded of this.settings.excludedFolders) {
      const ex = normalizeFolderPath(excluded);
      if (!ex) continue;
      for (let i = 0; i < parts.length - 1; i++) {
        if (parts.slice(0, i + 1).join("/") === ex) return true;
      }
    }
    return false;
  }

  /** 列出 Inbox（或全库）中待整理的 Markdown 文件 */
  listPendingFiles(): TFile[] {
    const files = this.app.vault.getMarkdownFiles();
    return files.filter((f) => {
      if (this.shouldIgnore(f)) return false;
      const folder = parentFolder(f.path);
      // 待整理：位于 Inbox，或用户未配置 Inbox 时视为全库待整理
      if (this.settings.inboxFolder) {
        return folder === this.settings.inboxFolder;
      }
      return true;
    });
  }

  /** 确保文件夹存在（递归创建），返回文件夹对象 */
  async ensureFolder(folderPath: string): Promise<TFolder> {
    const clean = normalizeFolderPath(folderPath);
    if (!clean) return this.app.vault.getRoot();
    const existing = this.app.vault.getAbstractFileByPath(clean);
    if (existing instanceof TFolder) return existing;

    // 逐级创建
    const segments = clean.split("/");
    let current = "";
    for (const seg of segments) {
      current = current ? `${current}/${seg}` : seg;
      const node = this.app.vault.getAbstractFileByPath(current);
      if (!node) {
        await this.app.vault.createFolder(current);
      }
    }
    const created = this.app.vault.getAbstractFileByPath(clean);
    if (!(created instanceof TFolder)) {
      throw new Error(`无法创建文件夹：${clean}`);
    }
    return created;
  }

  /**
   * 将文件移动到目标文件夹并更新链接。
   * @returns 新路径
   */
  async moveToFolder(file: TFile, targetFolder: string): Promise<string> {
    const folder = normalizeFolderPath(targetFolder);
    const newPath = folder
      ? normalizePath(`${folder}/${file.name}`)
      : normalizePath(file.name);

    if (newPath === normalizePath(file.path)) return file.path;

    if (folder) await this.ensureFolder(folder);
    // fileManager.renameFile 会按用户设置自动更新内部链接
    await this.app.fileManager.renameFile(file, newPath);
    return newPath;
  }

  /** 记录一次整理操作 */
  async recordMove(
    file: TFile,
    from: string,
    to: string,
    engine: string,
    reason: string,
    mode: "auto" | "manual"
  ): Promise<void> {
    if (!this.settings.enableLog) return;
    await this.log.append({
      time: new Date().toISOString(),
      file: file.name,
      from,
      to,
      engine,
      reason,
      mode,
    });
  }
}

/** 取文件路径的父文件夹（根级返回空串） */
export function parentFolder(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/** 规范化文件夹路径（与 utils/helpers 中逻辑一致，供服务层使用） */
export function normalizeFolderPath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

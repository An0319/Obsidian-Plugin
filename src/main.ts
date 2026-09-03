import { Plugin, TFile, Notice } from "obsidian";
import { SmartNotesSettings, DEFAULT_SETTINGS } from "./settings/settings";
import { SmartNotesSettingTab, obsidianHttp } from "./settings/settingsTab";
import { EngineDispatcher } from "./scheduler/dispatcher";
import { OrganizerService } from "./scheduler/organizerService";
import { RuleEngine } from "./engines/ruleEngine";
import { TfidfEngine } from "./engines/tfidf/tfidfEngine";
import { OllamaEngine } from "./engines/ollamaEngine";
import { SharedModelEngine } from "./engines/sharedModelEngine";
import { ActivityLog, FileOrganizer } from "./services/fileOrganizer";
import { EngineLevel, OllamaPromptContext } from "./types";

const CREATE_DEBOUNCE_MS = 5000;
const INTERNAL_MOVE_RESET_MS = 1500;

/**
 * Obsidian 智能笔记整理插件
 * 四层可切换引擎：规则映射 / TF-IDF / 本地大模型 / 社区共享配置
 */
export default class SmartNotesPlugin extends Plugin {
  settings: SmartNotesSettings = DEFAULT_SETTINGS;

  ruleEngine!: RuleEngine;
  tfidfEngine!: TfidfEngine;
  ollamaEngine!: OllamaEngine;
  sharedModelEngine = new SharedModelEngine();
  dispatcher = new EngineDispatcher();
  organizerService!: OrganizerService;
  activityLog!: ActivityLog;

  /** 自身移动引起的 rename 事件标记，避免整理循环 */
  private internalMove = false;
  /** 新建笔记防抖计时器 */
  private pendingCreates = new Map<string, ReturnType<typeof setTimeout>>();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.initEngines();
    this.registerCommands();
    this.registerEvents();

    this.addRibbonIcon("folder-input", "整理 Inbox", () =>
      this.organizeInboxCommand()
    );

    this.addSettingTab(new SmartNotesSettingTab(this.app, this));
  }

  onunload(): void {
    for (const timer of this.pendingCreates.values()) clearTimeout(timer);
    this.pendingCreates.clear();
    this.tfidfEngine.dispose?.();
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Partial<SmartNotesSettings>;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data, {
      ollama: Object.assign({}, DEFAULT_SETTINGS.ollama, data?.ollama),
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applySettings();
  }

  /** 将当前设置同步到各引擎 */
  private applySettings(): void {
    this.ruleEngine.setRules(this.settings.rules);
    this.tfidfEngine.setOptions({
      threshold: this.settings.tfidfThreshold,
      maxNotes: this.settings.tfidfMaxNotes,
      exemplarNotes: this.settings.exemplarNotes,
    });
    this.ollamaEngine.setSettings(this.settings.ollama);
    this.organizerService.updateSettings(this.settings);
    if (this.settings.sharedConfigJson && !this.sharedModelEngine.isLoaded) {
      try {
        this.sharedModelEngine.loadFromJson(this.settings.sharedConfigJson);
      } catch {
        // 配置损坏时静默忽略，设置面板会显示未加载状态
      }
    }
  }

  private initEngines(): void {
    this.activityLog = new ActivityLog(this.app, this.manifest.dir ?? "");
    const organizer = new FileOrganizer(this.app, this.settings, this.activityLog);
    this.organizerService = new OrganizerService(
      this.app,
      this.settings,
      this.dispatcher,
      organizer
    );

    this.ruleEngine = new RuleEngine(this.settings.rules);
    this.tfidfEngine = new TfidfEngine(this.organizerService.snapshotProvider(), {
      threshold: this.settings.tfidfThreshold,
      maxNotes: this.settings.tfidfMaxNotes,
      exemplarNotes: this.settings.exemplarNotes,
    });
    this.ollamaEngine = new OllamaEngine(
      this.settings.ollama,
      obsidianHttp,
      (): OllamaPromptContext => ({
        title: "",
        content: "",
        folderTree: this.organizerService.folderTree(),
      })
    );

    this.dispatcher.register(this.ruleEngine);
    this.dispatcher.register(this.tfidfEngine);
    this.dispatcher.register(this.ollamaEngine);
    this.dispatcher.register(this.sharedModelEngine);

    if (this.settings.sharedConfigJson) {
      try {
        this.sharedModelEngine.loadFromJson(this.settings.sharedConfigJson);
      } catch (err) {
        console.error("[SmartNotes] 共享配置加载失败", err);
      }
    }

    // 后台预热层级二缓存
    void this.tfidfEngine.initialize();
  }

  private registerCommands(): void {
    this.addCommand({
      id: "organize-current-note",
      name: "整理当前笔记",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (checking) return true;
        void this.organizeCurrentNote(file);
        return true;
      },
    });

    this.addCommand({
      id: "preview-current-suggestion",
      name: "预览当前笔记的整理建议",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (checking) return true;
        void this.previewSuggestion(file);
        return true;
      },
    });

    this.addCommand({
      id: "organize-inbox",
      name: "立即整理 Inbox",
      callback: () => void this.organizeInboxCommand(),
    });

    this.addCommand({
      id: "rebuild-tfidf-cache",
      name: "重建层级二特征缓存",
      callback: async () => {
        this.tfidfEngine.invalidateCache();
        await this.tfidfEngine.initialize();
        new Notice("文件夹特征缓存已重建");
      },
    });
  }

  private registerEvents(): void {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (!this.settings.autoOrganize) return;
        if (!this.inScope(file)) return;
        // 新建时文件往往还是空的，延迟等待用户写入内容
        const timer = setTimeout(() => {
          this.pendingCreates.delete(file.path);
          void this.autoOrganize(file);
        }, CREATE_DEBOUNCE_MS);
        this.pendingCreates.set(file.path, timer);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        void oldPath;
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (this.internalMove) return;
        if (!this.settings.autoOrganize) return;
        if (!this.inScope(file)) return;
        void this.autoOrganize(file);
      })
    );
  }

  /** 文件是否在整理范围内（Inbox 或全库） */
  private inScope(file: TFile): boolean {
    if (this.organizerService && this.settings.inboxFolder) {
      const idx = file.path.lastIndexOf("/");
      const folder = idx === -1 ? "" : file.path.slice(0, idx);
      return folder === this.settings.inboxFolder;
    }
    return true;
  }

  /** 自动整理：静默移动，完成后以 Notice 通知结果 */
  private async autoOrganize(file: TFile): Promise<void> {
    try {
      const result = await this.organizerService.organizeOne(file, "auto");
      if (result.moved && result.suggestion) {
        new Notice(
          `已将「${file.basename}」移至 ${result.suggestion.suggestedPath}（${result.suggestion.reason}）`
        );
      }
    } catch (err) {
      console.error("[SmartNotes] 自动整理失败", err);
    }
  }

  /** 整理单个文件：直接执行，全程无弹窗 */
  private async organizeCurrentNote(file: TFile): Promise<void> {
    const { suggestion } = await this.organizerService.analyze(file);
    if (!suggestion) {
      new Notice("所有引擎均无法给出建议，请检查引擎配置");
      return;
    }
    if (!suggestion.suggestedPath) {
      new Notice(`暂无合适建议：${suggestion.reason}`);
      return;
    }

    this.internalMove = true;
    setTimeout(() => (this.internalMove = false), INTERNAL_MOVE_RESET_MS);
    const newPath = await this.organizerService.apply(file, suggestion, "manual");
    if (newPath !== file.path) {
      new Notice(`已移动「${file.basename}」到 ${newPath}`);
    }
  }

  /** 预览建议（不执行移动） */
  private async previewSuggestion(file: TFile): Promise<void> {
    const { suggestion, degradedFrom, error } = await this.organizerService.analyze(file);
    if (!suggestion) {
      new Notice(`分析失败：${error ?? "未知错误"}`);
      return;
    }
    const target = suggestion.suggestedPath || "（建议保留原位）";
    const degradeNote = degradedFrom
      ? `\n（层级${degradedFrom}不可用，已降级到层级${suggestion.engine}）`
      : "";
    new Notice(
      `「${file.basename}」建议 → ${target}\n${suggestion.reason}${degradeNote}`,
      8000
    );
  }

  /** 整理 Inbox 命令：带进度与结果摘要 */
  private async organizeInboxCommand(): Promise<void> {
    const progress = new Notice("开始整理…", 0);
    const result = await this.organizerService.organizeInbox("auto", (done, total, name) => {
      progress.setMessage(`整理中 ${done}/${total}：${name}`);
    });
    progress.hide();

    new Notice(
      `整理完成：移动 ${result.moved} 篇，跳过 ${result.skipped} 篇` +
        (result.errors.length ? `，失败 ${result.errors.length} 篇` : "")
    );
    if (result.errors.length > 0) {
      console.warn("[SmartNotes] 整理错误：", result.errors);
    }
  }

  /** 导出共享配置（层级四，需先重建层级二缓存） */
  async exportSharedConfig(name: string): Promise<string> {
    await this.tfidfEngine.initialize();
    const vectors = this.tfidfEngine.getVectors();
    if (vectors.length === 0) {
      throw new Error("没有可用的文件夹特征，请确认知识库中已有笔记");
    }
    const { SharedModelEngine } = await import("./engines/sharedModelEngine");
    const config = SharedModelEngine.exportConfig(
      name,
      this.settings.rules,
      vectors,
      this.tfidfEngine.getIdf(),
      this.settings.tfidfThreshold
    );
    return JSON.stringify(config, null, 2);
  }
}

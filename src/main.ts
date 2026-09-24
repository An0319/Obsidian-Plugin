import { Plugin, TFile, Notice } from "obsidian";
import {
  SmartNotesSettings,
  DEFAULT_SETTINGS,
  AutoOrganizeMode,
  migrateSettings,
  migrateLegacySeedRules,
} from "./settings/settings";
import { SmartNotesSettingTab, obsidianHttp } from "./settings/settingsTab";
import { EngineDispatcher } from "./scheduler/dispatcher";
import { OrganizerService } from "./scheduler/organizerService";
import { RuleEngine } from "./engines/ruleEngine";
import { TfidfEngine } from "./engines/tfidf/tfidfEngine";
import { OllamaEngine } from "./engines/ollamaEngine";
import { SharedModelEngine } from "./engines/sharedModelEngine";
import { ActivityLog, FileOrganizer } from "./services/fileOrganizer";
import { EngineLevel, OllamaPromptContext, OllamaSettings } from "./types";
import { t, initLocale } from "./i18n";
import { BatchReportModal } from "./ui/batchReportModal";

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

  /** 标记一次插件内部移动（供撤销等 UI 操作复用，防整理回环） */
  markInternalMove(): void {
    this.internalMove = true;
    setTimeout(() => (this.internalMove = false), INTERNAL_MOVE_RESET_MS);
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.initEngines();
    this.registerCommands();
    this.registerEvents();

    this.addRibbonIcon("folder-input", t("cmd.organizeInbox"), () =>
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
    const data = await this.loadData();
    const migrated = migrateSettings(data);
    migrated.ollama = Object.assign(
      {},
      DEFAULT_SETTINGS.ollama,
      (data as { ollama?: Partial<OllamaSettings> } | null)?.ollama
    );
    // 0.3.5 一次性种子规则修正：收件箱兜底跟随 Inbox 设置、停用陈旧归档
    const { archiveDisabled } = migrateLegacySeedRules(migrated);
    this.settings = migrated;
    initLocale(migrated.locale);
    if (archiveDisabled) {
      new Notice(t("settings.archiveRuleMigrated"), 10000);
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applySettings();
  }

  /** 将当前设置同步到各引擎 */
  private applySettings(): void {
    this.ruleEngine.setRules(this.settings.rules);
    this.ruleEngine.setInboxFolder(this.settings.inboxFolder);
    this.sharedModelEngine.setInboxFolder(this.settings.inboxFolder);
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

    this.ruleEngine = new RuleEngine(this.settings.rules, this.settings.inboxFolder);
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
      name: t("cmd.organizeCurrent"),
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
      name: t("cmd.previewSuggestion"),
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
      name: t("cmd.organizeInbox"),
      callback: () => void this.organizeInboxCommand(),
    });

    this.addCommand({
      id: "rebuild-tfidf-cache",
      name: t("cmd.rebuildCache"),
      callback: async () => {
        this.tfidfEngine.invalidateCache();
        await this.tfidfEngine.initialize();
        new Notice(t("tfidf.rebuildDone"));
      },
    });
  }

  private registerEvents(): void {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (this.settings.autoOrganizeMode === AutoOrganizeMode.Off) return;
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
        if (this.settings.autoOrganizeMode === AutoOrganizeMode.Off) return;
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

  /**
   * 实时归档：Notify 模式仅提示建议（文件不动），Move 模式静默移动。
   */
  private async autoOrganize(file: TFile): Promise<void> {
    try {
      if (this.settings.autoOrganizeMode === AutoOrganizeMode.Notify) {
        const { suggestion, error } = await this.organizerService.analyze(file);
        if (error) return;
        if (!suggestion) return;
        if (!suggestion.suggestedPath) {
          // 弃权也落日志：top3 诊断让「为什么没建议」可回溯
          await this.organizerService.logRefusal(file, suggestion, "auto");
          return;
        }
        new Notice(
          t("notify.autoSuggest", {
            name: file.basename,
            to: suggestion.suggestedPath,
            reason: suggestion.reason,
          })
        );
        return;
      }
      const result = await this.organizerService.organizeOne(file, "auto");
      if (result.moved && result.suggestion?.suggestedPath) {
        new Notice(
          t("notify.autoMoved", {
            name: file.basename,
            to: result.suggestion.suggestedPath,
            reason: result.suggestion.reason,
          })
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
      new Notice(t("notify.noSuggestion"));
      return;
    }
    if (!suggestion.suggestedPath) {
      await this.organizerService.logRefusal(file, suggestion, "manual");
      new Notice(t("notify.keepInPlace", { reason: suggestion.reason }));
      return;
    }

    this.markInternalMove();
    const newPath = await this.organizerService.apply(file, suggestion, "manual");    if (newPath !== file.path) {
      new Notice(t("notify.movedTo", { name: file.basename, to: newPath }));
    }
  }

  /** 预览建议（不执行移动） */
  private async previewSuggestion(file: TFile): Promise<void> {
    const { suggestion, degradedFrom, error } = await this.organizerService.analyze(file);
    if (!suggestion) {
      new Notice(t("notify.analyzeFail", { msg: error ?? "-" }));
      return;
    }
    const target = suggestion.suggestedPath || t("preview.keepInPlace");
    const degradeNote = degradedFrom
      ? t("notify.degraded", { from: degradedFrom, to: suggestion.engine })
      : "";
    new Notice(
      t("notify.suggestTo", {
        name: file.basename,
        to: target,
        reason: suggestion.reason,
        degraded: degradeNote,
      }),
      8000
    );
  }

  /** 整理 Inbox 命令：带进度，完成后打开整理报告（含撤销） */
  private async organizeInboxCommand(): Promise<void> {
    const progress = new Notice(t("notify.inboxStart"), 0);
    const result = await this.organizerService.organizeInbox("auto", (done, total, name) => {
      progress.setMessage(t("notify.inboxProgress", { done, total, name }));
    });
    progress.hide();

    if (result.errors.length > 0) {
      console.warn("[SmartNotes] 整理错误：", result.errors);
    }
    new Notice(
      t("notify.inboxDone", {
        moved: result.moved,
        skipped: result.skipped,
        errors: result.errors.length
          ? t("notify.inboxErrors", { n: result.errors.length })
          : "",
      })
    );
    new BatchReportModal(this.app, this, result.entries).open();
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

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
import {
  scanDelayQueue,
  touchQueueEntry,
  removeQueueEntry,
  renameQueueEntry,
} from "./utils/delayQueue";

const CREATE_DEBOUNCE_MS = 5000;
const INTERNAL_MOVE_RESET_MS = 1500;
/** 静默期扫描间隔：只比对时间戳，开销可忽略 */
const DELAY_SWEEP_MS = 1000;

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
  private organizer!: FileOrganizer;

  /** 自身移动引起的 rename 事件标记，避免整理循环 */
  private internalMove = false;
  /** 新建笔记防抖计时器 */
  private pendingCreates = new Map<string, ReturnType<typeof setTimeout>>();
  /** 静默期扫描是否在执行中（防重入：单篇处理可能超过 1 个扫描间隔） */
  private sweeping = false;
  /** 队列内存变更未落盘标记（扫描循环里合并写盘，避免 modify 高频 IO） */
  private queueDirty = false;

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

    // 静默期：启动播种（Inbox 现有文件从启动时刻起算冷却期）+ 每秒扫描
    this.seedDelayQueue();
    this.registerDelaySweep();

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
    // 延迟从关闭切到开启（或 Inbox 变更）时，为尚无记录的 Inbox 文件播种
    this.seedDelayQueue();
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
    this.organizer = new FileOrganizer(this.app, this.settings, this.activityLog);
    const organizer = this.organizer;
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
        const stats = await this.tfidfEngine.learn();
        new Notice(t("tfidf.rebuildDone", stats));
      },
    });
  }

  private registerEvents(): void {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (this.settings.autoOrganizeMode === AutoOrganizeMode.Off) return;
        if (!this.inScope(file)) return;
        // 静默期模式：入队等待冷却，跳过立即整理
        if (this.delayActive()) {
          this.touchAndSave(file.path);
          return;
        }
        // 新建时文件往往还是空的，延迟等待用户写入内容
        const timer = setTimeout(() => {
          this.pendingCreates.delete(file.path);
          void this.autoOrganize(file);
        }, CREATE_DEBOUNCE_MS);
        this.pendingCreates.set(file.path, timer);
      })
    );

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (!this.delayActive()) return;
        if (!this.inScope(file)) return;
        // 静默期语义：继续编辑会顺延该篇的冷却计时
        const queue = this.settings.delayQueue;
        if (file.path in queue) {
          touchQueueEntry(queue, file.path, Date.now());
          this.queueDirty = true;
        }
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        if (this.internalMove) return;
        if (this.settings.autoOrganizeMode === AutoOrganizeMode.Off) return;
        if (!this.inScope(file)) return;
        // 静默期模式：保留原计时进度或按新进入处理
        if (this.delayActive()) {
          const queue = this.settings.delayQueue;
          if (!renameQueueEntry(queue, oldPath, file.path)) {
            touchQueueEntry(queue, file.path, Date.now());
          }
          this.queueDirty = true;
          return;
        }
        void this.autoOrganize(file);
      })
    );
  }

  /** 静默期延迟（毫秒）：0 = 立即（原行为） */
  private delayMs(): number {
    return (this.settings.autoOrganizeDelaySec || 0) * 1000;
  }

  /** 延迟模式生效中：实时归档开启且静默期大于 0 */
  private delayActive(): boolean {
    return (
      this.settings.autoOrganizeMode !== AutoOrganizeMode.Off &&
      this.delayMs() > 0
    );
  }

  /** 入队并标记待落盘（写盘合并到扫描循环，避免 modify 高频 IO） */
  private touchAndSave(path: string): void {
    touchQueueEntry(this.settings.delayQueue, path, Date.now());
    this.queueDirty = true;
  }

  /** 启动/延迟开启时播种：Inbox 里尚无记录的文件从当前时刻起算冷却期 */
  private seedDelayQueue(): void {
    if (!this.delayActive() || !this.organizer) return;
    const now = Date.now();
    let changed = false;
    for (const file of this.organizer.listPendingFiles()) {
      if (!(file.path in this.settings.delayQueue)) {
        touchQueueEntry(this.settings.delayQueue, file.path, now);
        changed = true;
      }
    }
    if (changed) void this.saveData(this.settings);
  }

  /** 注册静默期扫描（Obsidian registerInterval 随插件卸载自动清理） */
  private registerDelaySweep(): void {
    this.registerInterval(
      window.setInterval(() => void this.sweepDelayQueue(), DELAY_SWEEP_MS)
    );
  }

  /**
   * 静默期扫描：合并落盘 -> 清理过期条目 -> 处理到期待队列。
   * 单篇处理前重验文件仍在 Inbox；被手动搬走的条目静默出队；
   * 单篇异常只跳过该篇，不影响其余队列。
   */
  private async sweepDelayQueue(): Promise<void> {
    if (this.sweeping || !this.delayActive()) return;
    this.sweeping = true;
    try {
      if (this.queueDirty) {
        await this.saveData(this.settings);
        this.queueDirty = false;
      }
      const inbox = this.settings.inboxFolder;
      const inboxPaths = new Set<string>();
      for (const f of this.app.vault.getMarkdownFiles()) {
        const idx = f.path.lastIndexOf("/");
        if ((idx === -1 ? "" : f.path.slice(0, idx)) === inbox) {
          inboxPaths.add(f.path);
        }
      }
      const { due, stale } = scanDelayQueue(
        this.settings.delayQueue,
        inboxPaths,
        Date.now(),
        this.delayMs()
      );
      for (const path of stale) {
        removeQueueEntry(this.settings.delayQueue, path);
      }
      if (stale.length > 0) this.queueDirty = true;
      if (due.length === 0) {
        if (this.queueDirty) await this.saveData(this.settings);
        this.queueDirty = false;
        return;
      }

      const movedNames: string[] = [];
      const suggestions: string[] = [];
      for (const path of due) {
        const file = this.app.vault.getAbstractFileByPath(path);
        // 二次校验：处理期间文件可能被移动/删除
        if (!(file instanceof TFile)) {
          removeQueueEntry(this.settings.delayQueue, path);
          continue;
        }
        try {
          if (this.settings.autoOrganizeMode === AutoOrganizeMode.Notify) {
            const { suggestion, error } = await this.organizerService.analyze(file);
            if (error || !suggestion) continue;
            if (suggestion.suggestedPath) {
              suggestions.push(
                `${file.basename} → ${suggestion.suggestedPath}（${suggestion.reason}）`
              );
            } else {
              await this.organizerService.logRefusal(file, suggestion, "auto");
            }
          } else {
            const result = await this.organizerService.organizeOne(file, "auto");
            if (result.moved) {
              movedNames.push(file.basename);
              removeQueueEntry(this.settings.delayQueue, path);
              continue;
            }
          }
          // 文件仍在 Inbox（Notify 提醒过 / 弃权未动）：刷新计时，下个静默期再见
          touchQueueEntry(this.settings.delayQueue, path, Date.now());
        } catch (err) {
          console.error("[SmartNotes] 定时归档失败", path, err);
          touchQueueEntry(this.settings.delayQueue, path, Date.now());
        }
      }
      await this.saveData(this.settings);
      this.queueDirty = false;

      if (movedNames.length > 0) {
        new Notice(t("notify.delayedMoved", { n: movedNames.length }));
      }
      if (suggestions.length > 0) {
        new Notice(
          t("notify.delayedSuggestions", {
            n: suggestions.length,
            list: suggestions.join("\n"),
          }),
          8000
        );
      }
    } finally {
      this.sweeping = false;
    }
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

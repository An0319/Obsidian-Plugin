import {
  AbstractInputSuggest,
  App,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  requestUrl,
} from "obsidian";
import { SmartNotesSettings, DEFAULT_SETTINGS, AutoOrganizeMode } from "./settings";
import { EngineLevel, OrganizeRule, RuleField, RuleOperator } from "../types";
import { SharedModelEngine } from "../engines/sharedModelEngine";
import { OllamaEngine, HttpClient } from "../engines/ollamaEngine";
import { ActivityLog } from "../services/fileOrganizer";
import { collectFolderPaths } from "../services/seedFolderMapper";
import { collectUserFolderTree } from "../services/vaultFolders";
import { UserFolderNode, MAX_TREE_NODES } from "../services/userFolders";
import { describeRule } from "../services/ruleDescribe";
import { parentFolder } from "../services/fileOrganizer";
import { INBOX_TOKEN } from "../utils/helpers";
import {
  CUSTOM_RULES_PATH,
  parseCustomRules,
  buildSampleRulesJson,
  writeSampleRulesFile,
} from "../services/customRulesLoader";
import { ConfirmActionModal } from "../ui/batchReportModal";
import { t, setLocale, Locale, I18nKey } from "../i18n";
import SmartNotesPlugin from "../main";

/** Obsidian requestUrl 适配器（跨平台无 CORS 限制），带整体超时保护 */
const obsidianHttp: HttpClient = {
  async postJson(url, body, timeoutMs) {
    const request = requestUrl({
      url,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(body),
      throw: false,
    });
    let resp;
    if (timeoutMs > 0) {
      let timer: ReturnType<typeof setTimeout>;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`请求超时（${timeoutMs}ms）`)),
          timeoutMs
        );
      });
      try {
        resp = await Promise.race([request, timeout]);
      } finally {
        clearTimeout(timer!);
      }
    } else {
      resp = await request;
    }
    if (resp.status >= 400) {
      throw new Error(`HTTP ${resp.status}`);
    }
    return resp.text;
  },
};

/** 内置示例共享配置（供测试层级四功能） */
export function sampleSharedConfig(): string {
  const config = SharedModelEngine.exportConfig(
    "示例：技术研究库",
    [
      {
        id: "sample-frontend",
        name: "前端技术",
        field: RuleField.Content,
        operator: RuleOperator.Contains,
        pattern: "React",
        targetFolder: "技术/前端",
        enabled: true,
        weight: 0.9,
      },
      {
        id: "sample-devops",
        name: "运维部署",
        field: RuleField.Tag,
        operator: RuleOperator.Equals,
        pattern: "devops",
        targetFolder: "技术/运维",
        enabled: true,
        weight: 0.9,
      },
    ],
    [
      {
        folder: "技术/前端",
        vector: { react: 0.5, 组件: 0.4, 前端: 0.6, hook: 0.3 },
        norm: 1,
        docCount: 12,
        computedAt: 0,
      },
      {
        folder: "技术/运维",
        vector: { docker: 0.6, 部署: 0.5, 运维: 0.5, 服务器: 0.3 },
        norm: 1,
        docCount: 8,
        computedAt: 0,
      },
    ],
    { react: 2.1, 组件: 1.8, 前端: 2.3, hook: 1.5, docker: 2.5, 部署: 1.9, 运维: 2.2, 服务器: 1.7 },
    0.3,
    "内置示例配置，用于演示层级四的导入与匹配"
  );
  return JSON.stringify(config, null, 2);
}

/** 目标文件夹输入建议：候选为库内已有文件夹，选中后回写规则 */
class FolderInputSuggest extends AbstractInputSuggest<TFolder> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private onPick: (path: string) => void,
    private excludedFolders: string[]
  ) {
    super(app, inputEl);
  }

  protected getSuggestions(query: string): TFolder[] {
    const lower = query.trim().toLowerCase();
    return collectFolderPaths(this.app, this.excludedFolders)
      .map((path) => this.app.vault.getAbstractFileByPath(path))
      .filter((f): f is TFolder => f instanceof TFolder)
      .filter((f) => lower === "" || f.path.toLowerCase().includes(lower))
      .slice(0, 30);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.onPick(folder.path);
    this.close();
  }
}

/** 单条规则编辑弹窗 */
class RuleEditModal extends Modal {
  constructor(
    app: App,
    private rule: OrganizeRule,
    private isNew: boolean,
    private excludedFolders: string[],
    private onSave: (rule: OrganizeRule) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("smart-notes-edit-modal");
    contentEl.createEl("h3", { text: this.isNew ? t("rules.editTitleNew") : t("rules.editTitleEdit") });

    const rule = { ...this.rule };

    new Setting(contentEl).setName(t("rules.name")).addText((tx) =>
      tx.setValue(rule.name).onChange((v) => (rule.name = v))
    );

    new Setting(contentEl)
      .setName(t("rules.field"))
      .addDropdown((d) =>
        d
          .addOptions({
            [RuleField.Title]: t("rules.field.title"),
            [RuleField.Content]: t("rules.field.content"),
            [RuleField.Tag]: t("rules.field.tag"),
            [RuleField.Filename]: t("rules.field.filename"),
            [RuleField.ModifiedTime]: t("rules.field.mtime"),
          })
          .setValue(rule.field)
          .onChange((v) => (rule.field = v as RuleField))
      );

    new Setting(contentEl)
      .setName(t("rules.operator"))
      .addDropdown((d) =>
        d
          .addOptions({
            [RuleOperator.Contains]: t("rules.op.contains"),
            [RuleOperator.Equals]: t("rules.op.equals"),
            [RuleOperator.Regex]: t("rules.op.regex"),
            [RuleOperator.OlderThanDays]: t("rules.op.olderThanDays"),
            [RuleOperator.Always]: t("rules.op.always"),
          })
          .setValue(rule.operator)
          .onChange((v) => (rule.operator = v as RuleOperator))
      );

    new Setting(contentEl)
      .setName(t("rules.pattern"))
      .setDesc(
        rule.operator === RuleOperator.OlderThanDays
          ? t("rules.pattern.days")
          : rule.operator === RuleOperator.Always
            ? t("rules.pattern.always")
            : rule.operator === RuleOperator.Regex
              ? t("rules.pattern.regex")
              : t("rules.pattern.default")
      )
      .addText((tx) =>
        tx
          .setPlaceholder(
            rule.operator === RuleOperator.OlderThanDays
              ? t("rules.pattern.placeholder.days")
              : rule.operator === RuleOperator.Always
                ? ""
                : rule.operator === RuleOperator.Regex
                  ? t("rules.pattern.placeholder.regex")
                  : t("rules.pattern.placeholder.default")
          )
          .setValue(rule.pattern)
          .onChange((v) => (rule.pattern = v))
      );

    new Setting(contentEl)
      .setName(t("rules.target"))
      .setDesc(t("rules.targetDesc"))
      .addText((tx) => {
        tx.setPlaceholder(t("rules.targetPlaceholder"))
          .setValue(rule.targetFolder)
          .onChange((v) => (rule.targetFolder = v));
        new FolderInputSuggest(this.app, tx.inputEl, (path) => {
          rule.targetFolder = path;
          tx.setValue(path);
        }, this.excludedFolders);
        return tx;
      });

    new Setting(contentEl)
      .setName(t("rules.weight"))
      .setDesc(t("rules.weightDesc"))
      .addText((tx) => {
        tx.setPlaceholder(t("rules.weightPlaceholder"))
          .setValue(rule.weight !== undefined ? String(rule.weight) : "")
          .onChange((v) => {
            const n = Number(v);
            if (v.trim() === "") delete rule.weight;
            else if (Number.isFinite(n) && n >= 0 && n <= 1) rule.weight = n;
          });
        return tx;
      });

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText(t("common.save"))
          .setCta()
          .onClick(() => {
            if (!rule.name) {
              new Notice(t("rules.nameEmpty"));
              return;
            }
            if (rule.operator !== RuleOperator.Always && !rule.pattern) {
              new Notice(t("rules.patternEmpty"));
              return;
            }
            this.onSave(rule);
            this.close();
          })
      )
      .addButton((b) => b.setButtonText(t("common.cancel")).onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** 设置分页标识 */
type SettingsTabId = "quickstart" | "rulesFolders" | "intelligence" | "general";

const TAB_IDS: SettingsTabId[] = ["quickstart", "rulesFolders", "intelligence", "general"];
const TAB_LABEL_KEYS = {
  quickstart: "tab.quickstart",
  rulesFolders: "tab.rulesFolders",
  intelligence: "tab.intelligence",
  general: "tab.general",
} as const;

/** 设置面板：分页骨架 + 各分页渲染 */
export class SmartNotesSettingTab extends PluginSettingTab {
  plugin: SmartNotesPlugin;

  constructor(app: App, plugin: SmartNotesPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("smart-notes-settings");
    const settings = this.plugin.settings;
    setLocale(settings.locale);

    const active = this.normalizeTab(settings.lastSettingsTab);

    // 跨页引导：种子规则未导入
    if (!settings.rules.some((r) => r.id.startsWith("seed-"))) {
      containerEl.createEl("div", {
        cls: "smart-notes-banner",
        text: t("quick.hintNoSeed"),
      });
    }

    this.renderTabBar(containerEl, active);

    const page = containerEl.createDiv({ cls: "smart-notes-page" });
    switch (active) {
      case "quickstart":
        this.renderQuickStartPage(page);
        break;
      case "rulesFolders":
        this.renderRulesFoldersPage(page);
        break;
      case "intelligence":
        this.renderIntelligencePage(page);
        break;
      case "general":
        this.renderGeneralPage(page);
        break;
    }
  }

  /** 快速入门分组卡片：强调色标记 + 标题的卡头，返回内容宿主 */
  private renderQuickCard(container: HTMLElement, title: string): HTMLElement {
    const card = container.createDiv({ cls: "smart-notes-qs-card" });
    const head = card.createDiv({ cls: "smart-notes-qs-card-head" });
    head.createSpan({ cls: "smart-notes-qs-card-mark" });
    head.createSpan({ cls: "smart-notes-qs-card-title", text: title });
    return card.createDiv({ cls: "smart-notes-qs-card-body" });
  }

  private normalizeTab(value: string): SettingsTabId {
    return (TAB_IDS as string[]).includes(value) ? (value as SettingsTabId) : "quickstart";
  }

  /** 分页导航：segmented 样式，切换时记住分页 */
  private renderTabBar(container: HTMLElement, active: SettingsTabId): void {
    const bar = container.createDiv({ cls: "smart-notes-tabs" });
    for (const id of TAB_IDS) {
      const btn = bar.createEl("button", {
        cls: `smart-notes-tab${id === active ? " is-active" : ""}`,
        text: t(TAB_LABEL_KEYS[id]),
      });
      btn.addEventListener("click", async () => {
        this.plugin.settings.lastSettingsTab = id;
        await this.plugin.saveSettings();
        this.display();
      });
    }
  }

  // ===== 分页一：快速开始 =====
  private renderQuickStartPage(container: HTMLElement): void {
    const settings = this.plugin.settings;

    container.createEl("h2", { text: t("quick.title") });
    container.createEl("p", {
      cls: "smart-notes-quickstart-intro",
      text: t("quick.intro"),
    });

    // 卡一：三步上手（实心编号圆 + 标题 + 说明）
    const stepsHost = this.renderQuickCard(container, t("quick.stepsTitle"));
    const stepDefs = [
      { title: t("quick.step1Title"), desc: t("quick.step1Desc") },
      { title: t("quick.step2Title"), desc: t("quick.step2Desc") },
      { title: t("quick.step3Title"), desc: t("quick.step3Desc") },
    ];
    stepDefs.forEach((step, i) => {
      const row = stepsHost.createDiv({ cls: "smart-notes-qs-step" });
      row.createSpan({ cls: "smart-notes-qs-step-no", text: String(i + 1) });
      const body = row.createDiv({ cls: "smart-notes-qs-body" });
      body.createDiv({ cls: "smart-notes-qs-step-title", text: step.title });
      body.createDiv({ cls: "smart-notes-qs-step-desc", text: step.desc });
    });

    // 卡二：场景速查（需求 → 去哪做什么，逐行独立）
    const mapHost = this.renderQuickCard(container, t("quick.mapTitle"));
    for (let i = 1; i <= 6; i++) {
      const row = mapHost.createDiv({ cls: "smart-notes-qs-map-row" });
      row.createDiv({
        cls: "smart-notes-qs-map-need",
        text: t(`quick.map${i}Need` as I18nKey),
      });
      row.createDiv({
        cls: "smart-notes-qs-map-how",
        text: t(`quick.map${i}How` as I18nKey),
      });
    }

    // 卡三：分页地图（键帽页名 + 说明）
    const pagesHost = this.renderQuickCard(container, t("quick.pagesTitle"));
    const pageDefs = [
      { name: t("quick.pages1Name"), desc: t("quick.pages1Desc") },
      { name: t("quick.pages2Name"), desc: t("quick.pages2Desc") },
      { name: t("quick.pages3Name"), desc: t("quick.pages3Desc") },
      { name: t("quick.pages4Name"), desc: t("quick.pages4Desc") },
    ];
    for (const p of pageDefs) {
      const row = pagesHost.createDiv({ cls: "smart-notes-qs-page-row" });
      row.createSpan({ cls: "smart-notes-qs-page-name", text: p.name });
      row.createSpan({ cls: "smart-notes-qs-page-desc", text: p.desc });
    }

    container.createEl("h2", { text: t("engine.title") });
    new Setting(container)
      .setName(t("engine.level"))
      .setDesc(t("engine.levelDesc"))
      .addDropdown((d) =>
        d
          .addOptions({
            [String(EngineLevel.Rules)]: t("engine.l1"),
            [String(EngineLevel.Tfidf)]: t("engine.l2"),
            [String(EngineLevel.Ollama)]: t("engine.l3"),
            [String(EngineLevel.SharedModel)]: t("engine.l4"),
          })
          .setValue(String(settings.engineLevel))
          .onChange(async (v) => {
            settings.engineLevel = Number(v) as EngineLevel;
            await this.plugin.saveSettings();
          })
      );
  }

  // ===== 分页二：规则与文件夹 =====
  private renderRulesFoldersPage(container: HTMLElement): void {
    const settings = this.plugin.settings;

    container.createEl("h2", { text: t("rules.title") });
    container.createEl("p", {
      cls: "setting-item-description",
      text: t("rules.desc"),
    });
    this.renderRules(container);

    new Setting(container)
      .setName(t("seed.label"))
      .setDesc(t("seed.desc"))
      .addButton((b) =>
        b.setButtonText(t("seed.button")).onClick(async () => {
          const { defaultRules } = await import("../engines/ruleEngine");
          const { collectFolderPaths, mapSeedFolders } = await import("../services/seedFolderMapper");
          const existing = new Set(settings.rules.map((r) => r.id));
          const incoming = defaultRules().filter((r) => !existing.has(r.id));
          if (incoming.length === 0) {
            new Notice(t("seed.alreadyImported"));
            return;
          }
          const mappings = mapSeedFolders(
            collectFolderPaths(this.app, settings.excludedFolders),
            incoming.map((r) => ({ ruleId: r.id, defaultFolder: r.targetFolder })),
            settings.excludedFolders
          );
          const byId = new Map(mappings.map((m) => [m.ruleId, m]));
          for (const rule of incoming) {
            rule.targetFolder = byId.get(rule.id)?.mappedFolder ?? rule.targetFolder;
          }
          settings.rules.push(...incoming);
          await this.plugin.saveSettings();
          this.display();
          const lines = incoming.map((r) => {
            const m = byId.get(r.id);
            const folder = m?.mappedFolder ?? r.targetFolder;
            return `${r.name} → ${folder === INBOX_TOKEN ? settings.inboxFolder : folder}`;
          });
          new Notice(t("seed.imported", { n: incoming.length, detail: lines.join("\n") }), 8000);
        })
      );

    container.createEl("h2", { text: t("folders.title") });
    container.createEl("p", {
      cls: "setting-item-description",
      text: t("folders.desc"),
    });
    this.renderFolderTree(container);

    new Setting(container)
      .setName(t("customRules.label"))
      .setDesc(t("customRules.desc"))
      .addButton((b) =>
        b.setButtonText(t("customRules.sample")).onClick(async () => {
          const doWrite = async () => {
            try {
              await writeSampleRulesFile(this.app);
              this.display();
              new Notice(t("customRules.sampleDone"), 10000);
            } catch (err) {
              new Notice(t("customRules.sampleFail", { msg: err instanceof Error ? err.message : String(err) }), 8000);
            }
          };
          const exists = this.app.vault.getAbstractFileByPath(CUSTOM_RULES_PATH) instanceof TFile;
          if (exists) {
            new ConfirmActionModal(
              this.app,
              t("customRules.confirmOverwriteTitle"),
              t("customRules.confirmOverwrite"),
              t("customRules.overwrite"),
              () => void doWrite()
            ).open();
          } else {
            await doWrite();
          }
        })
      )
      .addButton((b) =>
        b.setButtonText(t("customRules.import")).onClick(async () => {
          const file = this.app.vault.getAbstractFileByPath(CUSTOM_RULES_PATH);
          if (!(file instanceof TFile)) {
            new Notice(t("customRules.notFound"), 8000);
            return;
          }
          let json: string;
          try {
            json = await this.app.vault.cachedRead(file);
          } catch (err) {
            new Notice(t("customRules.readFail", { msg: err instanceof Error ? err.message : String(err) }));
            return;
          }
          try {
            const { rules, description } = parseCustomRules(json);
            const existing = new Set(settings.rules.map((r) => r.id));
            const fresh = rules.filter((r) => !existing.has(r.id));
            settings.rules.push(...fresh);
            await this.plugin.saveSettings();
            this.display();
            new Notice(
              fresh.length === rules.length
                ? t("customRules.importedFrom", { desc: description, n: fresh.length })
                : t("customRules.importedPartial", { n: fresh.length, m: rules.length - fresh.length }),
              8000
            );
          } catch (err) {
            new Notice(err instanceof Error ? err.message : String(err), 8000);
          }
        })
      );
  }

  // ===== 分页三：智能与模型 =====
  private renderIntelligencePage(container: HTMLElement): void {
    const settings = this.plugin.settings;

    // 层级二
    container.createEl("h2", { text: t("tfidf.title") });
    container.createEl("p", {
      cls: "setting-item-description",
      text: t("tfidf.desc"),
    });
    new Setting(container)
      .setName(t("tfidf.threshold"))
      .setDesc(t("tfidf.thresholdDesc", { pct: (settings.tfidfThreshold * 100).toFixed(0) }))
      .addSlider((s) =>
        s
          .setLimits(0.1, 0.9, 0.05)
          .setValue(settings.tfidfThreshold)
          .setDynamicTooltip()
          .onChange(async (v) => {
            settings.tfidfThreshold = v;
            this.plugin.tfidfEngine.setOptions({ threshold: v });
            await this.plugin.saveSettings();
          })
      );
    new Setting(container)
      .setName(t("tfidf.maxNotes"))
      .setDesc(t("tfidf.maxNotesDesc"))
      .addText((tx) =>
        tx
          .setValue(String(settings.tfidfMaxNotes))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n > 0) {
              settings.tfidfMaxNotes = n;
              this.plugin.tfidfEngine.setOptions({ maxNotes: n });
              await this.plugin.saveSettings();
            }
          })
      );
    new Setting(container)
      .setName(t("tfidf.rebuild"))
      .setDesc(t("tfidf.rebuildDesc"))
      .addButton((b) =>
        b.setButtonText(t("tfidf.rebuildButton")).onClick(async () => {
          this.plugin.tfidfEngine.invalidateCache();
          await this.plugin.tfidfEngine.initialize();
          new Notice(t("tfidf.rebuildDone"));
        })
      );

    // 层级三
    container.createEl("h2", { text: t("ollama.title") });
    new Setting(container)
      .setName(t("ollama.address"))
      .addText((tx) =>
        tx.setValue(settings.ollama.address).onChange(async (v) => {
          settings.ollama.address = v.trim() || "http://localhost:11434";
          await this.plugin.saveSettings();
        })
      );
    new Setting(container)
      .setName(t("ollama.model"))
      .setDesc(t("ollama.modelDesc"))
      .addText((tx) =>
        tx.setValue(settings.ollama.model).onChange(async (v) => {
          settings.ollama.model = v.trim() || "qwen2.5:7b";
          await this.plugin.saveSettings();
        })
      );
    new Setting(container)
      .setName(t("ollama.timeout"))
      .addText((tx) =>
        tx
          .setValue(String(settings.ollama.timeoutMs))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n > 1000) {
              settings.ollama.timeoutMs = n;
              await this.plugin.saveSettings();
            }
          })
      );
    new Setting(container)
      .setName(t("ollama.fallback"))
      .setDesc(t("ollama.fallbackDesc"))
      .addToggle((tx) =>
        tx.setValue(settings.ollama.fallback).onChange(async (v) => {
          settings.ollama.fallback = v;
          await this.plugin.saveSettings();
        })
      );
    new Setting(container)
      .setName(t("ollama.test"))
      .addButton((b) =>
        b.setButtonText(t("ollama.testButton")).onClick(async () => {
          const engine = new OllamaEngine(
            settings.ollama,
            obsidianHttp,
            () => null
          );
          const ok = await engine.isAvailable();
          new Notice(
            ok
              ? t("ollama.testOk", { model: settings.ollama.model })
              : t("ollama.testFail")
          );
        })
      );

    // 层级四
    container.createEl("h2", { text: t("shared.title") });
    const statusText = this.plugin.sharedModelEngine.isLoaded
      ? t("shared.loaded", { name: this.plugin.sharedModelEngine.configName })
      : t("shared.notLoaded");
    new Setting(container)
      .setName(t("shared.status"))
      .setDesc(statusText)
      .addButton((b) =>
        b.setButtonText(t("shared.importSample")).onClick(async () => {
          settings.sharedConfigJson = sampleSharedConfig();
          this.plugin.sharedModelEngine.loadFromJson(settings.sharedConfigJson);
          await this.plugin.saveSettings();
          this.display();
          new Notice(t("shared.importSampleDone"));
        })
      );
    new Setting(container)
      .setName(t("shared.importFile"))
      .setDesc(t("shared.importFileDesc"))
      .addButton((b) => {
        const input = createEl("input", { type: "file", attr: { accept: ".json" } });
        input.style.display = "none";
        input.addEventListener("change", async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            this.plugin.sharedModelEngine.loadFromJson(text);
            settings.sharedConfigJson = text;
            await this.plugin.saveSettings();
            this.display();
            new Notice(t("shared.imported", { name: this.plugin.sharedModelEngine.configName }));
          } catch (err) {
            new Notice(t("shared.importFail", { msg: err instanceof Error ? err.message : String(err) }));
          }
        });
        b.buttonEl.parentElement?.appendChild(input);
        b.setButtonText(t("shared.chooseFile")).onClick(() => input.click());
      });
    new Setting(container)
      .setName(t("shared.export"))
      .setDesc(t("shared.exportDesc"))
      .addButton((b) =>
        b.setButtonText(t("shared.exportButton")).onClick(async () => {
          try {
            const json = await this.plugin.exportSharedConfig("我的整理配置");
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = createEl("a", { href: url, text: "" });
            a.download = "smart-notes-config.json";
            a.click();
            URL.revokeObjectURL(url);
            new Notice(t("shared.exported"));
          } catch (err) {
            new Notice(t("shared.exportFail", { msg: err instanceof Error ? err.message : String(err) }));
          }
        })
      );
  }

  // ===== 分页四：通用 =====
  private renderGeneralPage(container: HTMLElement): void {
    const settings = this.plugin.settings;

    container.createEl("h2", { text: t("general.title") });
    container.createEl("p", {
      cls: "setting-item-description",
      text: t("general.desc"),
    });
    new Setting(container)
      .setName(t("general.autoMode"))
      .setDesc(t("general.autoModeDesc"))
      .addDropdown((d) =>
        d
          .addOptions({
            [String(AutoOrganizeMode.Off)]: t("general.auto.off"),
            [String(AutoOrganizeMode.Notify)]: t("general.auto.notify"),
            [String(AutoOrganizeMode.Move)]: t("general.auto.move"),
          })
          .setValue(String(settings.autoOrganizeMode))
          .onChange(async (v) => {
            settings.autoOrganizeMode = Number(v) as AutoOrganizeMode;
            await this.plugin.saveSettings();
          })
      );
    new Setting(container)
      .setName(t("general.inbox"))
      .setDesc(t("general.inboxDesc"))
      .addText((tx) =>
        tx.setValue(settings.inboxFolder).onChange(async (v) => {
          settings.inboxFolder = v.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(container)
      .setName(t("general.unclassified"))
      .setDesc(t("general.unclassifiedDesc"))
      .addText((tx) =>
        tx.setValue(settings.unclassifiedFolder).onChange(async (v) => {
          settings.unclassifiedFolder = v.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(container)
      .setName(t("general.excluded"))
      .setDesc(t("general.excludedDesc"))
      .addText((tx) =>
        tx
          .setValue(settings.excludedFolders.join(", "))
          .onChange(async (v) => {
            settings.excludedFolders = v.split(",").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );
    new Setting(container)
      .setName(t("general.locale"))
      .setDesc(t("general.localeDesc"))
      .addDropdown((d) =>
        d
          .addOptions({
            auto: t("general.locale.auto"),
            zh: t("general.locale.zh"),
            en: t("general.locale.en"),
          })
          .setValue(settings.locale)
          .onChange(async (v) => {
            settings.locale = v as Locale;
            setLocale(settings.locale);
            await this.plugin.saveSettings();
            this.display();
          })
      );
    new Setting(container)
      .setName(t("general.enableLog"))
      .setDesc(t("general.enableLogDesc"))
      .addToggle((tx) =>
        tx.setValue(settings.enableLog).onChange(async (v) => {
          settings.enableLog = v;
          await this.plugin.saveSettings();
        })
      );
    new Setting(container)
      .setName(t("general.reset"))
      .addButton((b) =>
        b.setButtonText(t("general.resetButton")).setWarning().onClick(async () => {
          this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS, {
            rules: DEFAULT_SETTINGS.rules,
          });
          await this.plugin.saveSettings();
          setLocale(this.plugin.settings.locale);
          this.display();
          new Notice(t("general.resetDone"));
        })
      );

    container.createEl("h2", { text: t("log.title") });
    container.createEl("p", {
      cls: "setting-item-description",
      text: t("log.desc"),
    });
    const log = new ActivityLog(this.app, this.plugin.manifest.dir ?? "");
    new Setting(container)
      .setName(t("log.clear"))
      .setDesc(t("log.clearDesc"))
      .addButton((b) =>
        b
          .setIcon("copy")
          .setTooltip(t("log.copyTip"))
          .onClick(async () => {
            const entries = await log.read();
            await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
            new Notice(t("log.copied"));
          })
      )
      .addButton((b) =>
        b.setButtonText(t("log.clearButton")).setWarning().onClick(async () => {
          await log.clear();
          this.display();
          new Notice(t("log.cleared"));
        })
      );
    // 日志装箱：先建宿主卡，异步读取后再填充，等宽行有了边界
    const logCard = container.createDiv({ cls: "smart-notes-card" });
    void log.read().then((entries) => {
      if (entries.length === 0) {
        logCard.createEl("p", { cls: "smart-notes-log-empty", text: t("log.empty") });
        return;
      }
      for (const entry of entries.slice(0, 20)) {
        const refused = entry.action === "refuse" || (!entry.action && !entry.to);
        const head = `${entry.time.slice(0, 16).replace("T", " ")}  ${entry.file}: `;
        const text = refused
          ? `${head}${t("log.refused")}  [${entry.engine}] ${entry.reason}`
          : `${head}${entry.from || "/"} -> ${entry.to}  [${entry.engine}]`;
        logCard.createEl("p", { text, cls: "smart-notes-log-line" });
      }
    });
  }

  /** 渲染规则列表（按顺序即优先级，支持上下移动 / 启停 / 删除；整体装箱） */
  private renderRules(container: HTMLElement): void {
    const settings = this.plugin.settings;
    const wrap = container.createDiv({ cls: "smart-notes-card smart-notes-rules" });
    settings.rules.forEach((rule, index) => {
      const setting = new Setting(wrap)
        .setName(`${index + 1}. ${rule.name}`)
        .setDesc(`${describeRule(rule)} → ${targetLabel(rule.targetFolder)}`);
      setting.addToggle((tx) =>
        tx.setValue(rule.enabled).onChange(async (v) => {
          rule.enabled = v;
          await this.plugin.saveSettings();
        })
      );
      setting.addExtraButton((b) =>
        b
          .setIcon("arrow-up")
          .setTooltip(t("rules.upTip"))
          .onClick(async () => {
            if (index === 0) return;
            const [r] = settings.rules.splice(index, 1);
            settings.rules.splice(index - 1, 0, r);
            await this.plugin.saveSettings();
            this.display();
          })
      );
      setting.addExtraButton((b) =>
        b
          .setIcon("arrow-down")
          .setTooltip(t("rules.downTip"))
          .onClick(async () => {
            if (index === settings.rules.length - 1) return;
            const [r] = settings.rules.splice(index, 1);
            settings.rules.splice(index + 1, 0, r);
            await this.plugin.saveSettings();
            this.display();
          })
      );
      setting.addButton((b) =>
        b.setIcon("pencil").setTooltip(t("rules.editTip")).onClick(() => {
          new RuleEditModal(this.app, rule, false, settings.excludedFolders, async (updated) => {
            settings.rules[index] = updated;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        })
      );
      setting.addButton((b) =>
        b.setIcon("trash").setTooltip(t("rules.deleteTip")).onClick(async () => {
          settings.rules.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        })
      );
    });
    new Setting(wrap).addButton((b) =>
      b
        .setButtonText(t("rules.new"))
        .setCta()
        .onClick(() => {
          const blank: OrganizeRule = {
            id: `rule-${Date.now()}`,
            name: "",
            field: RuleField.Content,
            operator: RuleOperator.Contains,
            pattern: "",
            targetFolder: "",
            enabled: true,
          };
          new RuleEditModal(this.app, blank, true, settings.excludedFolders, async (created) => {
            settings.rules.push(created);
            await this.plugin.saveSettings();
            this.display();
          }).open();
        })
    );
  }

  /** 渲染「从已有文件夹开始」：任意深度折叠树 + 一键建规则草稿 */
  private renderFolderTree(container: HTMLElement): void {
    const settings = this.plugin.settings;
    const nodes = collectUserFolderTree(this.app, settings.excludedFolders);

    if (nodes.length === 0) {
      container.createEl("p", {
        cls: "setting-item-description",
        text: t("folders.empty"),
      });
      return;
    }

    const collapseDefault = nodes.length > MAX_TREE_NODES;
    const byParent = new Map<string, UserFolderNode[]>();
    for (const node of nodes) {
      const parent = parentFolder(node.path);
      const list = byParent.get(parent) ?? [];
      list.push(node);
      byParent.set(parent, list);
    }

    const treeCard = container.createDiv({ cls: "smart-notes-card" });
    const tree = treeCard.createDiv({ cls: "smart-notes-tree" });
    const buildLevel = (parentPath: string, host: HTMLElement) => {
      for (const node of byParent.get(parentPath) ?? []) {
        const children = byParent.get(node.path) ?? [];
        const hasChildren = children.length > 0;
        const item = host.createDiv({ cls: "smart-notes-tree-item" });
        const row = item.createDiv({
          cls: `smart-notes-tree-row${hasChildren ? " is-expandable" : ""}`,
        });

        const chevron = row.createSpan({
          cls: `smart-notes-tree-chevron${hasChildren ? "" : " is-leaf"}`,
          text: "▸",
        });
        const name = row.createSpan({
          cls: "smart-notes-tree-name",
          text: node.name,
        });
        name.addEventListener("click", () => {
          if (!hasChildren) return;
          item.toggleClass("is-open", !item.hasClass("is-open"));
        });
        chevron.addEventListener("click", () => {
          if (!hasChildren) return;
          item.toggleClass("is-open", !item.hasClass("is-open"));
        });
        row.createSpan({
          cls: "smart-notes-tree-count",
          text: String(node.noteCount),
        });
        const buildBtn = row.createEl("button", {
          cls: "smart-notes-btn smart-notes-btn-ghost",
          text: t("folders.buildRule"),
        });
        buildBtn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          const draft: OrganizeRule = {
            id: `rule-${Date.now()}`,
            name: `整理到 ${node.name}`,
            field: RuleField.Filename,
            operator: RuleOperator.Contains,
            pattern: node.name,
            targetFolder: node.path,
            enabled: true,
          };
          new RuleEditModal(this.app, draft, true, settings.excludedFolders, async (created) => {
            settings.rules.push(created);
            await this.plugin.saveSettings();
            this.display();
            new Notice(t("folders.ruleAdded", { name: created.name }));
          }).open();
        });

        if (node.noteCount === 0) {
          row.createSpan({
            cls: "smart-notes-tree-coldstart",
            text: t("folders.coldStart"),
          });
        }

        if (hasChildren) {
          const childHost = item.createDiv({ cls: "smart-notes-tree-children" });
          if (collapseDefault) {
            item.addClass("is-collapsed-default");
          } else {
            item.addClass("is-open");
          }
          buildLevel(node.path, childHost);
        }
      }
    };
    buildLevel("", tree);

    if (nodes.length > MAX_TREE_NODES) {
      container.createEl("p", {
        cls: "setting-item-description",
        text: t("folders.overflow", { n: nodes.length, shown: MAX_TREE_NODES }),
      });
    }
  }
}

/** 规则目标显示：{inbox} 占位符转为人话（跟随 Inbox 设置） */
function targetLabel(folder: string): string {
  return folder === INBOX_TOKEN ? t("rules.inboxToken") : folder;
}

export { obsidianHttp };

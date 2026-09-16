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
import { SmartNotesSettings, DEFAULT_SETTINGS } from "./settings";
import { EngineLevel, OrganizeRule, RuleField, RuleOperator } from "../types";
import { SharedModelEngine } from "../engines/sharedModelEngine";
import { OllamaEngine, HttpClient } from "../engines/ollamaEngine";
import { ActivityLog } from "../services/fileOrganizer";
import { collectFolderPaths } from "../services/seedFolderMapper";
import { collectUserFolders } from "../services/vaultFolders";
import { MAX_DISPLAY_FOLDERS, UserFolder } from "../services/userFolders";
import {
  CUSTOM_RULES_PATH,
  parseCustomRules,
  buildSampleRulesJson,
  writeSampleRulesFile,
} from "../services/customRulesLoader";
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

/** 单条规则编辑弹窗 */
/** 覆盖确认弹窗：样例文件已存在时使用 */
class SampleOverwriteModal extends Modal {
  constructor(
    app: App,
    private message: string,
    private onConfirm: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: "覆盖确认" });
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) =>
        b
          .setButtonText("覆盖")
          .setWarning()
          .onClick(() => {
            this.onConfirm();
            this.close();
          })
      )
      .addButton((b) => b.setButtonText("取消").onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
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
    contentEl.createEl("h3", { text: this.isNew ? "新建规则" : "编辑规则" });

    const rule = { ...this.rule };

    new Setting(contentEl).setName("规则名称").addText((t) =>
      t.setValue(rule.name).onChange((v) => (rule.name = v))
    );

    new Setting(contentEl)
      .setName("匹配字段")
      .addDropdown((d) =>
        d
          .addOptions({
            [RuleField.Title]: "标题",
            [RuleField.Content]: "笔记内容",
            [RuleField.Tag]: "标签",
            [RuleField.Filename]: "文件名 / 路径",
            [RuleField.ModifiedTime]: "修改时间",
          })
          .setValue(rule.field)
          .onChange((v) => (rule.field = v as RuleField))
      );

    new Setting(contentEl)
      .setName("匹配方式")
      .addDropdown((d) =>
        d
          .addOptions({
            [RuleOperator.Contains]: "包含",
            [RuleOperator.Equals]: "等于",
            [RuleOperator.Regex]: "正则表达式",
            [RuleOperator.OlderThanDays]: "超过 N 天未修改",
            [RuleOperator.Always]: "无条件命中（兜底）",
          })
          .setValue(rule.operator)
          .onChange((v) => (rule.operator = v as RuleOperator))
      );

    new Setting(contentEl)
      .setName("匹配模式")
      .setDesc(
        rule.operator === RuleOperator.OlderThanDays
          ? "填写天数，如：30 表示超过 30 天未修改"
          : rule.operator === RuleOperator.Always
            ? "兜底规则无需填写"
            : "填写笔记中要找的文字，如：投资（进阶：也可填正则表达式）"
      )
      .addText((t) =>
        t
          .setPlaceholder(
            rule.operator === RuleOperator.OlderThanDays
              ? "30"
              : rule.operator === RuleOperator.Always
                ? ""
                : "如：投资"
          )
          .setValue(rule.pattern)
          .onChange((v) => (rule.pattern = v))
      );

    new Setting(contentEl).setName("目标文件夹")
      .setDesc("从库内已有文件夹选择，或直接输入新路径（首次移动时自动创建）")
      .addText((t) => {
        t.setPlaceholder("如：02-战略/竞品").setValue(rule.targetFolder).onChange((v) => (rule.targetFolder = v));
        new FolderInputSuggest(this.app, t.inputEl, (path) => {
          rule.targetFolder = path;
          t.setValue(path);
        }, this.excludedFolders);
        return t;
      });

    new Setting(contentEl)
      .setName("权重（可选）")
      .setDesc("0~1，影响命中时的置信度；留空或 1 表示默认置信度")
      .addText((t) => {
        t.setPlaceholder("如：0.9")
          .setValue(rule.weight !== undefined ? String(rule.weight) : "")
          .onChange((v) => {
            const n = Number(v);
            if (v.trim() === "") delete rule.weight;
            else if (Number.isFinite(n) && n >= 0 && n <= 1) rule.weight = n;
          });
        return t;
      });

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText("保存")
          .setCta()
            .onClick(() => {
              if (!rule.name) {
                new Notice("规则名称不能为空");
                return;
              }
              if (rule.operator !== RuleOperator.Always && !rule.pattern) {
                new Notice("匹配模式不能为空");
                return;
              }
              this.onSave(rule);
              this.close();
            })
      )
      .addButton((b) => b.setButtonText("取消").onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** 匹配字段的中文名称（用于规则列表展示） */
const FIELD_LABELS: Record<string, string> = {
  [RuleField.Title]: "标题",
  [RuleField.Content]: "笔记内容",
  [RuleField.Tag]: "标签",
  [RuleField.Filename]: "文件名 / 路径",
  [RuleField.ModifiedTime]: "修改时间",
};

/** 生成规则的人类可读描述（用于规则列表展示） */
function describeRule(rule: OrganizeRule): string {
  const fieldLabel = FIELD_LABELS[rule.field] ?? rule.field;
  switch (rule.operator) {
    case RuleOperator.Regex:
      return `文件名 / 路径 匹配「${rule.pattern}」`;
    case RuleOperator.Equals:
      return `${fieldLabel} 等于「${rule.pattern}」`;
    case RuleOperator.OlderThanDays:
      return `修改时间超过 ${rule.pattern} 天`;
    case RuleOperator.Always:
      return "无条件命中";
    default:
      return `${fieldLabel} 包含「${rule.pattern}」`;
  }
}

/** 设置面板 */
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

    // ===== 快速入门 =====
    containerEl.createEl("h2", { text: "快速入门" });
    const quickStart = containerEl.createDiv({ cls: "smart-notes-quickstart" });
    quickStart.createEl("p", {
      text: "工作原理：把笔记投入 Inbox → 点击左侧 Ribbon 图标（或自动监听）→ 插件判断归属并移动，内部链接自动更新。全程本地运行，不匹配的笔记保留原位。",
    });
    quickStart.createEl("p", {
      text: "首次配置三步：① 下方确认 Inbox 文件夹名与你的习惯一致；② 建立整理规则——三个起点任选：从已有文件夹一键生成、导入内置规则集、或手工新建；③ 用一篇笔记点 Ribbon 试运行。",
    });
    if (!settings.rules.some((r) => r.id.startsWith("seed-"))) {
      quickStart.createEl("p", {
        cls: "smart-notes-quickstart-hint",
        text: "尚未导入内置规则集——在「层级一：规则映射」分区点击「导入种子规则」即可开始。",
      });
    }

    // ===== 引擎选择 =====
    containerEl.createEl("h2", { text: "整理引擎" });
    new Setting(containerEl)
      .setName("当前引擎层级")
      .setDesc("层级一零门槛开箱即用；层级二无需 AI 模型；层级三需本地 Ollama；层级四零计算享受共享智慧")
      .addDropdown((d) =>
        d
          .addOptions({
            [String(EngineLevel.Rules)]: "层级一：规则映射",
            [String(EngineLevel.Tfidf)]: "层级二：TF-IDF 智能匹配",
            [String(EngineLevel.Ollama)]: "层级三：本地大模型（Ollama）",
            [String(EngineLevel.SharedModel)]: "层级四：社区共享配置",
          })
          .setValue(String(settings.engineLevel))
          .onChange(async (v) => {
            settings.engineLevel = Number(v) as EngineLevel;
            await this.plugin.saveSettings();
          })
      );

    // ===== 层级一：规则列表 =====
    containerEl.createEl("h3", { text: "层级一：规则映射" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "规则按顺序逐条匹配，命中即移动；条件支持文件名 / 标题 / 内容 / 标签 / 修改时间。目标文件夹输入框支持从库内已有文件夹中选择。",
    });
    this.renderRules();
    new Setting(containerEl)
      .setName("种子规则集")
      .setDesc("一键导入默认规则（日志归位 / 归档陈旧笔记 / 收件箱兜底）；已有同名规则会跳过，目标文件夹自动复用你库内已有的同名或等价文件夹")
      .addButton((b) =>
        b.setButtonText("导入种子规则").onClick(async () => {
          const { defaultRules } = await import("../engines/ruleEngine");
          const { collectFolderPaths, mapSeedFolders } = await import("../services/seedFolderMapper");
          const existing = new Set(settings.rules.map((r) => r.id));
          const incoming = defaultRules().filter((r) => !existing.has(r.id));
          if (incoming.length === 0) {
            new Notice("种子规则已存在，无需重复导入");
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
            return m?.reused
              ? `${r.name} → ${m.mappedFolder}（复用已有文件夹）`
              : `${r.name} → ${m?.mappedFolder}（首次移动时创建）`;
          });
          new Notice(`已导入 ${incoming.length} 条种子规则：\n${lines.join("\n")}`, 8000);
        })
      );

    // ===== 从已有文件夹开始 =====
    containerEl.createEl("h3", { text: "从已有文件夹开始" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "库里已经分好类的文件夹可以直接利用：点「建规则」会打开规则编辑器，目标文件夹和匹配内容已帮你填好，改一下就能保存使用。",
    });
    this.renderExistingFolders();

    new Setting(containerEl)
      .setName("custom_rules.json")
      .setDesc("在库的最外层放一个名为 custom_rules.json 的规则文件，点「从库根导入」即可批量添加规则。没有该文件可先点「生成样例文件」获得一份可直接修改的示例。")
      .addButton((b) =>
        b.setButtonText("生成样例文件").onClick(async () => {
          const doWrite = async () => {
            try {
              await writeSampleRulesFile(this.app);
              this.display();
              new Notice(
                `已在库的最外层创建 ${CUSTOM_RULES_PATH} 示例文件：打开修改后，点「从库根导入」即可体验`,
                10000
              );
            } catch (err) {
              new Notice(`创建失败：${err instanceof Error ? err.message : String(err)}`, 8000);
            }
          };
          const exists = this.app.vault.getAbstractFileByPath(CUSTOM_RULES_PATH) instanceof TFile;
          if (exists) {
            new SampleOverwriteModal(
              this.app,
              `库的最外层已有 ${CUSTOM_RULES_PATH}，生成样例会覆盖现有内容，确定继续吗？`,
              doWrite
            ).open();
          } else {
            await doWrite();
          }
        })
      )
      .addButton((b) =>
        b.setButtonText("从库根导入").onClick(async () => {
          const file = this.app.vault.getAbstractFileByPath(CUSTOM_RULES_PATH);
          if (!(file instanceof TFile)) {
            new Notice(`未找到 ${CUSTOM_RULES_PATH}——请在库根目录创建后重试`, 8000);
            return;
          }
          let json: string;
          try {
            json = await this.app.vault.cachedRead(file);
          } catch (err) {
            new Notice(`读取失败：${err instanceof Error ? err.message : String(err)}`);
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
                ? `已从 ${description} 导入 ${fresh.length} 条规则`
                : `导入 ${fresh.length} 条，跳过 ${rules.length - fresh.length} 条已存在（id 重复）`,
              8000
            );
          } catch (err) {
            new Notice(err instanceof Error ? err.message : String(err), 8000);
          }
        })
      );

    // ===== 层级二 =====
    containerEl.createEl("h3", { text: "层级二：TF-IDF 智能匹配" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "从你已有文件夹的内容中学习特征向量：某文件夹笔记越多，相似的新笔记越容易被归入其中。无需配置即可跟随你的目录结构。",
    });
    new Setting(containerEl)
      .setName("相似度阈值")
      .setDesc(`当前 ${(settings.tfidfThreshold * 100).toFixed(0)}%，低于该值时建议保留原位`)
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
    new Setting(containerEl)
      .setName("参与计算的笔记上限")
      .setDesc("每文件夹按最新优先截取，避免大库卡顿")
      .addText((t) =>
        t
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
    new Setting(containerEl)
      .setName("重建特征缓存")
      .setDesc("文件夹内容变更会自动重算，也可手动触发")
      .addButton((b) =>
        b.setButtonText("重建").onClick(async () => {
          this.plugin.tfidfEngine.invalidateCache();
          await this.plugin.tfidfEngine.initialize();
          new Notice("文件夹特征已重建");
        })
      );

    // ===== 层级三 =====
    containerEl.createEl("h3", { text: "层级三：本地大模型（Ollama）" });
    new Setting(containerEl)
      .setName("Ollama 地址")
      .addText((t) =>
        t.setValue(settings.ollama.address).onChange(async (v) => {
          settings.ollama.address = v.trim() || "http://localhost:11434";
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("模型名称")
      .setDesc("默认 qwen2.5:7b，需已通过 ollama pull 下载")
      .addText((t) =>
        t.setValue(settings.ollama.model).onChange(async (v) => {
          settings.ollama.model = v.trim() || "qwen2.5:7b";
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("请求超时（毫秒）")
      .addText((t) =>
        t
          .setValue(String(settings.ollama.timeoutMs))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (Number.isFinite(n) && n > 1000) {
              settings.ollama.timeoutMs = n;
              await this.plugin.saveSettings();
            }
          })
      );
    new Setting(containerEl)
      .setName("失败自动降级")
      .setDesc("Ollama 未运行或超时时自动降级到层级二 / 层级一")
      .addToggle((t) =>
        t.setValue(settings.ollama.fallback).onChange(async (v) => {
          settings.ollama.fallback = v;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("连接测试")
      .addButton((b) =>
        b.setButtonText("测试").onClick(async () => {
          const engine = new OllamaEngine(
            settings.ollama,
            obsidianHttp,
            () => null
          );
          const ok = await engine.isAvailable();
          new Notice(
            ok
              ? `Ollama 连接成功（${settings.ollama.model}）`
              : "无法连接 Ollama，请确认服务已启动（ollama serve）"
          );
        })
      );

    // ===== 层级四 =====
    containerEl.createEl("h3", { text: "层级四：社区共享配置" });
    const statusText = this.plugin.sharedModelEngine.isLoaded
      ? `已加载：${this.plugin.sharedModelEngine.configName}`
      : "未加载配置";
    new Setting(containerEl)
      .setName("配置状态")
      .setDesc(statusText)
      .addButton((b) =>
        b.setButtonText("导入示例配置").onClick(async () => {
          settings.sharedConfigJson = sampleSharedConfig();
          this.plugin.sharedModelEngine.loadFromJson(settings.sharedConfigJson);
          await this.plugin.saveSettings();
          this.display();
          new Notice("示例配置已导入");
        })
      );
    new Setting(containerEl)
      .setName("导入配置文件")
      .setDesc("选择社区分享的 JSON 配置文件")
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
            new Notice(`已导入配置「${this.plugin.sharedModelEngine.configName}」`);
          } catch (err) {
            new Notice(`导入失败：${err instanceof Error ? err.message : String(err)}`);
          }
        });
        b.buttonEl.parentElement?.appendChild(input);
        b.setButtonText("选择文件").onClick(() => input.click());
      });
    new Setting(containerEl)
      .setName("导出当前配置")
      .setDesc("导出规则 + 预计算文件夹向量，可分享到社区（建议层级二缓存重建后导出）")
      .addButton((b) =>
        b.setButtonText("导出 JSON").onClick(async () => {
          try {
            const json = await this.plugin.exportSharedConfig("我的整理配置");
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = createEl("a", { href: url, text: "" });
            a.download = "smart-notes-config.json";
            a.click();
            URL.revokeObjectURL(url);
            new Notice("配置已导出下载");
          } catch (err) {
            new Notice(`导出失败：${err instanceof Error ? err.message : String(err)}`);
          }
        })
      );

    // ===== 通用设置 =====
    containerEl.createEl("h2", { text: "通用设置" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Inbox 文件夹名、排除范围与日志开关。排除的文件夹插件永不触碰，附件与模板目录默认已在白名单内。",
    });
    new Setting(containerEl)
      .setName("启用自动整理")
      .setDesc("监听新建笔记并自动给出整理建议")
      .addToggle((t) =>
        t.setValue(settings.autoOrganize).onChange(async (v) => {
          settings.autoOrganize = v;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("Inbox 文件夹名")
      .setDesc("自动整理只处理该文件夹内的新笔记；留空则处理全库")
      .addText((t) =>
        t.setValue(settings.inboxFolder).onChange(async (v) => {
          settings.inboxFolder = v.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("未归类文件夹")
      .setDesc("所有引擎均无建议时的兜底目标；留空则保留原位")
      .addText((t) =>
        t.setValue(settings.unclassifiedFolder).onChange(async (v) => {
          settings.unclassifiedFolder = v.trim();
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("排除文件夹")
      .setDesc("逗号分隔，这些文件夹及其子目录不参与整理与特征计算")
      .addText((t) =>
        t
          .setValue(settings.excludedFolders.join(", "))
          .onChange(async (v) => {
            settings.excludedFolders = v.split(",").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );
    new Setting(containerEl)
      .setName("记录整理日志")
      .setDesc("保存最近 200 次移动记录到插件目录（organize-log.json），便于追溯")
      .addToggle((t) =>
        t.setValue(settings.enableLog).onChange(async (v) => {
          settings.enableLog = v;
          await this.plugin.saveSettings();
        })
      );
    new Setting(containerEl)
      .setName("恢复默认设置")
      .addButton((b) =>
        b.setButtonText("重置").setWarning().onClick(async () => {
          this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
          await this.plugin.saveSettings();
          this.display();
          new Notice("已恢复默认设置");
        })
      );

    // ===== 日志 =====
    containerEl.createEl("h2", { text: "最近整理记录" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "仅保留最近 200 条移动记录（organize-log.json，存于插件目录），超出自动丢弃最旧的。数据完全本地保存，可随时清空。",
    });
    const log = new ActivityLog(this.app, this.plugin.manifest.dir ?? "");
    new Setting(containerEl)
      .setName("清空整理记录")
      .setDesc("删除全部历史记录，此操作不可恢复")
      .addButton((b) =>
        b.setButtonText("清空").setWarning().onClick(async () => {
          await log.clear();
          this.display();
          new Notice("整理记录已清空");
        })
      );
    void log.read().then((entries) => {
      if (entries.length === 0) {
        containerEl.createEl("p", { text: "暂无记录" });
        return;
      }
      for (const entry of entries.slice(0, 20)) {
        const line = containerEl.createEl("p", {
          text: `${entry.time.slice(0, 16).replace("T", " ")}  ${entry.file}: ${entry.from || "(根)"} -> ${entry.to}  [${entry.engine}]`,
          cls: "smart-notes-log-line",
        });
      }
    });
  }

  /** 渲染「从已有文件夹开始」分区：用户文件夹列表 + 一键建规则草稿 */
  private renderExistingFolders(): void {
    const settings = this.plugin.settings;
    const folders = collectUserFolders(this.app, settings.excludedFolders);

    if (folders.length === 0) {
      this.containerEl.createEl("p", {
        cls: "setting-item-description",
        text: "还没有可用的文件夹——先在库里建一个分类文件夹，或用上方内置规则开始。",
      });
      return;
    }

    const shown = folders.slice(0, MAX_DISPLAY_FOLDERS);
    for (const folder of shown) {
      new Setting(this.containerEl)
        .setName(folder.name)
        .setDesc(`路径 ${folder.path} · ${folder.noteCount} 篇笔记`)
        .addButton((b) =>
          b.setButtonText("建规则").onClick(() => {
            const draft: OrganizeRule = {
              id: `rule-${Date.now()}`,
              name: `整理到 ${folder.name}`,
              field: RuleField.Filename,
              operator: RuleOperator.Contains,
              pattern: folder.name,
              targetFolder: folder.path,
              enabled: true,
            };
            new RuleEditModal(this.app, draft, true, settings.excludedFolders, async (created) => {
              settings.rules.push(created);
              await this.plugin.saveSettings();
              this.display();
              new Notice(`规则「${created.name}」已添加`);
            }).open();
          })
        );
    }
    if (folders.length > shown.length) {
      this.containerEl.createEl("p", {
        cls: "setting-item-description",
        text: `共 ${folders.length} 个文件夹，仅展示前 ${shown.length} 个——其余可在规则编辑器的目标文件夹输入框中直接选择。`,
      });
    }
  }

  /** 渲染规则列表（按顺序即优先级，支持上下移动 / 启停 / 删除） */
  private renderRules(): void {    const settings = this.plugin.settings;
    const wrap = this.containerEl.createDiv({ cls: "smart-notes-rules" });
    settings.rules.forEach((rule, index) => {
      const setting = new Setting(wrap)
        .setName(`${index + 1}. ${rule.name}`)
        .setDesc(`${describeRule(rule)} → ${rule.targetFolder}`);
      setting.addToggle((t) =>
        t.setValue(rule.enabled).onChange(async (v) => {
          rule.enabled = v;
          await this.plugin.saveSettings();
        })
      );
      setting.addExtraButton((b) =>
        b
          .setIcon("arrow-up")
          .setTooltip("上移（提高优先级）")
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
          .setTooltip("下移（降低优先级）")
          .onClick(async () => {
            if (index === settings.rules.length - 1) return;
            const [r] = settings.rules.splice(index, 1);
            settings.rules.splice(index + 1, 0, r);
            await this.plugin.saveSettings();
            this.display();
          })
      );
      setting.addButton((b) =>
        b.setIcon("pencil").setTooltip("编辑").onClick(() => {
          new RuleEditModal(this.app, rule, false, settings.excludedFolders, async (updated) => {
            settings.rules[index] = updated;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        })
      );
      setting.addButton((b) =>
        b.setIcon("trash").setTooltip("删除").onClick(async () => {
          settings.rules.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        })
      );
    });
    new Setting(wrap).addButton((b) =>
      b
        .setButtonText("新建规则")
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
}

export { obsidianHttp };

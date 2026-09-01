import {
  App,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  requestUrl,
} from "obsidian";
import { SmartNotesSettings, DEFAULT_SETTINGS } from "./settings";
import { EngineLevel, OrganizeRule, RuleField, RuleOperator } from "../types";
import { SharedModelEngine } from "../engines/sharedModelEngine";
import { OllamaEngine, HttpClient } from "../engines/ollamaEngine";
import { ActivityLog } from "../services/fileOrganizer";
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
class RuleEditModal extends Modal {
  constructor(
    app: App,
    private rule: OrganizeRule,
    private isNew: boolean,
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
            [RuleField.Title]: "标题包含域",
            [RuleField.Content]: "笔记内容",
            [RuleField.Tag]: "标签",
            [RuleField.Filename]: "文件路径",
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
          })
          .setValue(rule.operator)
          .onChange((v) => (rule.operator = v as RuleOperator))
      );

    new Setting(contentEl).setName("匹配模式").addText((t) =>
      t.setPlaceholder("如：投资 或 ^\\d{4}-\\d{2}-\\d{2}$").setValue(rule.pattern).onChange((v) => (rule.pattern = v))
    );

    new Setting(contentEl).setName("目标文件夹").addText((t) =>
      t.setPlaceholder("如：02-战略/竞品").setValue(rule.targetFolder).onChange((v) => (rule.targetFolder = v))
    );

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText("保存")
          .setCta()
          .onClick(() => {
            if (!rule.name || !rule.pattern) {
              new Notice("规则名称与匹配模式不能为空");
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

/** 建议确认弹窗：移动前展示建议路径，用户可修改 */
export class SuggestConfirmModal extends Modal {
  private confirmed: ((path: string | null) => void) | null = null;

  constructor(
    app: App,
    private fileName: string,
    private suggestedPath: string,
    private reason: string,
    private engineName: string
  ) {
    super(app);
  }

  /** 返回用户确认的路径；取消返回 null */
  static confirm(
    app: App,
    fileName: string,
    suggestedPath: string,
    reason: string,
    engineName: string
  ): Promise<string | null> {
    const modal = new SuggestConfirmModal(app, fileName, suggestedPath, reason, engineName);
    return new Promise((resolve) => {
      modal.confirmed = resolve;
      modal.open();
    });
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "整理建议" });
    contentEl.createEl("p", {
      text: `「${this.fileName}」建议移动到：`,
    });

    let inputValue = this.suggestedPath;
    const input = contentEl.createEl("input", {
      type: "text",
      value: this.suggestedPath,
    });
    input.style.width = "100%";
    input.addEventListener("input", () => (inputValue = input.value));

    const reasonEl = contentEl.createEl("p", {
      text: `依据（${this.engineName}）：${this.reason}`,
    });
    reasonEl.style.color = "var(--text-muted)";
    reasonEl.style.fontSize = "0.85em";

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText("移动")
          .setCta()
          .onClick(() => this.confirmed?.(inputValue.trim() || null))
      )
      .addButton((b) =>
        b.setButtonText("跳过").onClick(() => this.confirmed?.(null))
      );
  }

  onClose(): void {
    this.confirmed?.(null);
    this.contentEl.empty();
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
    const settings = this.plugin.settings;

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
    this.renderRules();
    new Setting(containerEl)
      .setName("内置规则模板")
      .setDesc("一键导入通用规则模板（投资笔记 / 会议记录 / 日记 / 待办）")
      .addButton((b) =>
        b.setButtonText("导入模板").onClick(async () => {
          const { defaultRules } = await import("../engines/ruleEngine");
          const existing = new Set(settings.rules.map((r) => r.id));
          const incoming = defaultRules().filter((r) => !existing.has(r.id));
          settings.rules.push(...incoming);
          await this.plugin.saveSettings();
          this.display();
          new Notice(`已导入 ${incoming.length} 条模板规则`);
        })
      );

    // ===== 层级二 =====
    containerEl.createEl("h3", { text: "层级二：TF-IDF 智能匹配" });
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
      .setName("移动前确认")
      .setDesc("开启后展示建议弹窗，可修改目标路径；关闭则静默移动")
      .addToggle((t) =>
        t.setValue(settings.confirmBeforeMove).onChange(async (v) => {
          settings.confirmBeforeMove = v;
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
    const log = new ActivityLog(this.app, this.plugin.manifest.dir ?? "");
    void log.read().then((entries) => {
      if (entries.length === 0) {
        containerEl.createEl("p", { text: "暂无记录" });
        return;
      }
      for (const entry of entries.slice(0, 20)) {
        const line = containerEl.createEl("p", {
          text: `${entry.time.slice(0, 16).replace("T", " ")}  ${entry.file}: ${entry.from || "(根)"} -> ${entry.to}  [${entry.engine}]`,
        });
        line.style.fontSize = "0.85em";
        line.style.margin = "2px 0";
      }
    });
  }

  /** 渲染规则列表（按顺序即优先级，支持上下移动 / 启停 / 删除） */
  private renderRules(): void {
    const settings = this.plugin.settings;
    const wrap = this.containerEl.createDiv();
    settings.rules.forEach((rule, index) => {
      const setting = new Setting(wrap)
        .setName(`${index + 1}. ${rule.name}`)
        .setDesc(
          `${rule.field} ${rule.operator === "regex" ? "匹配" : rule.operator === "equals" ? "等于" : "包含"}「${rule.pattern}」 → ${rule.targetFolder}`
        );
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
          new RuleEditModal(this.app, rule, false, async (updated) => {
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
          new RuleEditModal(this.app, blank, true, async (created) => {
            settings.rules.push(created);
            await this.plugin.saveSettings();
            this.display();
          }).open();
        })
    );
  }
}

export { obsidianHttp };

import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { BatchEntry } from "../scheduler/organizerService";
import { resolveUndoPath } from "../utils/undoPath";
import { t } from "../i18n";
import type SmartNotesPlugin from "../main";

/**
 * 批量整理报告：逐篇展示去向 / 依据 / 置信度，支持单篇与整批撤销。
 * 撤销通过反向 renameFile 实现，internalMove 防回环，日志标注 undo。
 */
export class BatchReportModal extends Modal {
  constructor(
    app: App,
    private plugin: SmartNotesPlugin,
    private entries: BatchEntry[]
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("smart-notes-report");

    contentEl.createEl("h3", { text: t("report.title") });
    this.renderSummary(contentEl);
    this.renderMovedSection(contentEl);
    this.renderKeptSection(contentEl);
  }

  private renderSummary(container: HTMLElement): void {
    const movedCount = this.entries.filter((e) => e.moved && !e.undone).length;
    const keptCount = this.entries.filter((e) => !e.moved).length;
    const summary = container.createDiv({ cls: "smart-notes-report-summary" });
    summary.createSpan({ cls: "smart-notes-badge smart-notes-badge-ok", text: t("report.moved", { n: movedCount }) });
    summary.createSpan({ cls: "smart-notes-badge", text: t("report.kept", { n: keptCount }) });
  }

  private renderMovedSection(container: HTMLElement): void {
    const movedEntries = this.entries.filter((e) => e.moved);
    if (movedEntries.length === 0) return;

    const undoable = movedEntries.filter((e) => !e.undone);
    const section = container.createDiv({ cls: "smart-notes-report-section" });
    section.createEl("h4", { text: t("report.moved", { n: movedEntries.filter((e) => !e.undone).length }) });

    if (undoable.length >= 1) {
      new Setting(section)
        .setName(t("report.undoAll"))
        .setDesc(t("report.undoConfirm", { n: undoable.length }))
        .addButton((b) =>
          b.setButtonText(t("report.undoAll")).onClick(() => {
            new ConfirmActionModal(
              this.app,
              t("report.undoConfirmTitle"),
              t("report.undoConfirm", { n: undoable.length }),
              t("report.undoAll"),
              () => void this.undoAll(container)
            ).open();
          })
        );
    }

    const list = section.createDiv({ cls: "smart-notes-report-list" });
    for (const entry of movedEntries) {
      this.renderMovedRow(list, entry, container);
    }
  }

  private renderMovedRow(list: HTMLElement, entry: BatchEntry, container: HTMLElement): void {
    const row = list.createDiv({
      cls: `smart-notes-report-row${entry.undone ? " is-undone" : ""}`,
    });
    const main = row.createDiv({ cls: "smart-notes-report-row-main" });
    const title = main.createDiv({ cls: "smart-notes-report-row-title" });
    title.createSpan({ cls: "smart-notes-report-file", text: entry.file });
    title.createSpan({ cls: "smart-notes-report-arrow", text: ` ${t("report.to")} ` });
    title.createSpan({ cls: "smart-notes-report-to", text: entry.to.split("/").slice(0, -1).join("/") || "/" });

    const meta = main.createDiv({ cls: "smart-notes-report-row-meta" });
    if (entry.engine) {
      meta.createSpan({ cls: "smart-notes-badge", text: entry.engine });
    }
    meta.createSpan({
      cls: `smart-notes-badge ${confidenceClass(entry.confidence)}`,
      text: `${Math.round(entry.confidence * 100)}%`,
    });
    meta.createSpan({ cls: "smart-notes-report-reason", text: entry.reason });
    if (entry.undone) {
      meta.createSpan({ cls: "smart-notes-badge smart-notes-badge-muted", text: t("report.undone") });
    }

    if (!entry.undone) {
      const actions = row.createDiv({ cls: "smart-notes-report-row-actions" });
      actions.createEl("button", { cls: "smart-notes-btn", text: t("report.undo") }).addEventListener("click", () => {
        void this.undoOne(entry, container);
      });
    }
  }

  private renderKeptSection(container: HTMLElement): void {
    const kept = this.entries.filter((e) => !e.moved);
    if (kept.length === 0) return;

    const section = container.createDiv({ cls: "smart-notes-report-section" });
    section.createEl("h4", { text: t("report.kept", { n: kept.length }) });
    const list = section.createDiv({ cls: "smart-notes-report-list" });
    for (const entry of kept) {
      const row = list.createDiv({ cls: "smart-notes-report-row is-kept" });
      const main = row.createDiv({ cls: "smart-notes-report-row-main" });
      main.createDiv({ cls: "smart-notes-report-row-title" }).createSpan({
        cls: "smart-notes-report-file",
        text: entry.file,
      });
      const meta = main.createDiv({ cls: "smart-notes-report-row-meta" });
      if (entry.refused) {
        meta.createSpan({
          cls: "smart-notes-badge smart-notes-badge-muted",
          text: t("report.refused"),
        });
      }
      meta.createSpan({ cls: "smart-notes-report-reason", text: `${t("report.keptReason")}：${entry.reason}` });
    }
  }

  /** 撤销单篇：反向移动 + internalMove 防回环 + 日志标注 undo */
  private async undoOne(entry: BatchEntry, container: HTMLElement): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(entry.to);
      if (!(file instanceof TFile)) {
        new Notice(t("report.fileGone"), 8000);
        entry.undone = false;
        return;
      }
      const target = resolveUndoPath(entry.from, (p) =>
        this.app.vault.getAbstractFileByPath(p) instanceof TFile
      );
      this.plugin.markInternalMove();
      await this.app.fileManager.renameFile(file, target);
      entry.undone = true;
      await this.plugin.activityLog.append({
        time: new Date().toISOString(),
        file: entry.file,
        from: entry.to,
        to: target,
        engine: "undo",
        reason: t("report.undone"),
        mode: "manual",
        action: "undo",
      });
      new Notice(t("report.undoDone"));
    } catch (err) {
      new Notice(err instanceof Error ? err.message : String(err), 8000);
      return;
    }
    this.rerender(container);
  }

  /** 整批撤销：按报告顺序逆序执行，失败逐条跳过 */
  private async undoAll(container: HTMLElement): Promise<void> {
    const targets = this.entries.filter((e) => e.moved && !e.undone);
    let done = 0;
    let failed = 0;
    for (const entry of [...targets].reverse()) {
      try {
        const file = this.app.vault.getAbstractFileByPath(entry.to);
        if (!(file instanceof TFile)) {
          failed++;
          continue;
        }
        const target = resolveUndoPath(entry.from, (p) =>
          this.app.vault.getAbstractFileByPath(p) instanceof TFile
        );
        this.plugin.markInternalMove();
        await this.app.fileManager.renameFile(file, target);
        entry.undone = true;
        await this.plugin.activityLog.append({
          time: new Date().toISOString(),
          file: entry.file,
          from: entry.to,
          to: target,
          engine: "undo",
          reason: t("report.undone"),
          mode: "manual",
          action: "undo",
        });
        done++;
      } catch {
        failed++;
      }
    }
    new Notice(
      failed === 0
        ? t("report.undoDoneAll", { n: done })
        : t("report.undoFail", { n: done, m: failed }),
      8000
    );
    this.rerender(container);
  }

  private rerender(container: HTMLElement): void {
    container.empty();
    this.renderSummary(container);
    this.renderMovedSection(container);
    this.renderKeptSection(container);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** 置信度徽章等级：高 = 成功色，中 = 中性，低 = 警示色 */
function confidenceClass(confidence: number): string {
  if (confidence >= 0.7) return "smart-notes-badge-ok";
  if (confidence >= 0.4) return "smart-notes-badge-muted";
  return "smart-notes-badge-warn";
}

/** 通用确认弹窗（撤销、覆盖等破坏性操作共用） */
export class ConfirmActionModal extends Modal {
  constructor(
    app: App,
    private title: string,
    private message: string,
    private confirmLabel: string,
    private onConfirm: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("smart-notes-confirm");
    this.contentEl.createEl("h3", { text: this.title });
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((b) =>
        b
          .setButtonText(this.confirmLabel)
          .setWarning()
          .onClick(() => {
            this.onConfirm();
            this.close();
          })
      )
      .addButton((b) =>
        b.setButtonText(t("common.cancel")).onClick(() => this.close())
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

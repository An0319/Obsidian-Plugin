import { App, TFile, TFolder } from "obsidian";
import { UserFolder, UserFolderNode, filterUserFolders, filterUserFolderTree } from "./userFolders";

/** 递归统计文件夹内 Markdown 笔记数量（附件与子文件夹本身不计） */
function countMarkdownNotes(folder: TFolder): number {
  let count = 0;
  for (const child of folder.children) {
    if (child instanceof TFile && child.extension === "md") count++;
    else if (child instanceof TFolder) count += countMarkdownNotes(child);
  }
  return count;
}

/** 递归收集文件夹树（含任意深度子文件夹）及其笔记总数 */
function collectTree(folder: TFolder, out: { path: string; noteCount: number }[]): void {
  for (const child of folder.children) {
    if (child instanceof TFolder && child.path.length > 0) {
      out.push({ path: child.path, noteCount: countMarkdownNotes(child) });
      collectTree(child, out);
    }
  }
}

/**
 * 扫描库内一级文件夹并统计笔记数量，返回可直接展示的用户文件夹列表。
 * 排除规则与整理引擎一致（系统目录 + 用户排除清单）。
 */
export function collectUserFolders(app: App, excludedFolders: string[]): UserFolder[] {
  const root = app.vault.getRoot();
  const folders: { path: string; noteCount: number }[] = [];
  for (const child of root.children) {
    if (child instanceof TFolder && child.path.length > 0) {
      folders.push({ path: child.path, noteCount: countMarkdownNotes(child) });
    }
  }
  return filterUserFolders(folders, excludedFolders);
}

/**
 * 扫描库内全部文件夹（任意深度），返回树形展示数据。
 * 排除规则与整理引擎一致；noteCount 含子文件夹笔记。
 */
export function collectUserFolderTree(
  app: App,
  excludedFolders: string[]
): UserFolderNode[] {
  const root = app.vault.getRoot();
  const folders: { path: string; noteCount: number }[] = [];
  collectTree(root, folders);
  return filterUserFolderTree(folders, excludedFolders);
}

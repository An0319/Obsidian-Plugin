import { App, TFolder } from "obsidian";
import { isFolderExcluded } from "./seedMapping";

/**
 * 收集库内文件夹相对路径（排除根目录、隐藏目录与排除项），
 * 供种子映射与规则编辑器 FolderSuggest 共用。
 */
export function collectFolderPaths(app: App, excludedFolders: string[]): string[] {
  const paths: string[] = [];
  for (const file of app.vault.getAllLoadedFiles()) {
    if (file instanceof TFolder && file.path !== "/") {
      paths.push(file.path);
    }
  }
  return paths.filter((p) => !isFolderExcluded(p, excludedFolders)).sort();
}

export { isFolderExcluded, mapSeedFolders, SEED_ALIASES } from "./seedMapping";
export type { SeedMappingResult } from "./seedMapping";

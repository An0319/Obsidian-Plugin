import { normalizeFolderPath } from "../utils/helpers";

/** 种子规则与库内文件夹的映射结果 */
export interface SeedMappingResult {
  ruleId: string;
  defaultFolder: string;
  mappedFolder: string;
  /** true = 复用用户已有文件夹；false = 保留默认目标（首次移动时创建） */
  reused: boolean;
}

/**
 * 种子规则目标文件夹别名表。
 * 键为种子规则默认目标（小写），值为常见等价文件夹名（小写）。
 * 匹配时与库内文件夹的末段做大小写不敏感比对。
 */
export const SEED_ALIASES: Record<string, string[]> = {
  日志: ["daily", "daily-notes", "dailies", "journal", "journals", "diary", "diaries", "日记", "日志", "logs", "log"],
  归档: ["archive", "archives", "archived", "存档", "归档"],
  收件箱: ["inbox", "inboxes", "收集箱", "收件箱", "collection", "collections"],
};

/**
 * 判断文件夹路径是否应被排除：
 * 任一前缀路径命中排除列表，或任一段以 . 开头（隐藏目录）。
 * 与 organizerService 的 isExcluded 语义保持一致。
 */
export function isFolderExcluded(folderPath: string, excludedFolders: string[]): boolean {
  const parts = folderPath.split("/").filter(Boolean);
  if (parts.some((p) => p.startsWith("."))) return true;
  const excluded = new Set(excludedFolders.map((f) => f.trim()).filter(Boolean));
  for (let i = 0; i < parts.length; i++) {
    if (excluded.has(parts.slice(0, i + 1).join("/"))) return true;
  }
  return false;
}

/**
 * 为种子规则映射库内已有文件夹。
 * 匹配顺序：文件夹末段与默认目标精确相等 -> 命中别名表 -> 保留默认。
 * 多个候选时取路径最短（最顶层），同长取字典序，保证结果稳定。
 * 纯函数：只读输入，零副作用，返回完整映射明细。
 */
export function mapSeedFolders(
  vaultFolders: string[],
  seedTargets: { ruleId: string; defaultFolder: string }[],
  excludedFolders: string[]
): SeedMappingResult[] {
  const folders = vaultFolders
    .map((f) => normalizeFolderPath(f))
    .filter((f) => f.length > 0 && !isFolderExcluded(f, excludedFolders));

  return seedTargets.map(({ ruleId, defaultFolder }) => {
    const target = normalizeFolderPath(defaultFolder);
    const expected = target.toLowerCase();
    const aliases = SEED_ALIASES[expected] ?? [];

    const candidates = folders.filter((f) => {
      const last = f.split("/").pop() ?? "";
      const lastLower = last.trim().toLowerCase();
      return lastLower === expected || aliases.includes(lastLower);
    });

    if (candidates.length === 0) {
      return { ruleId, defaultFolder: target, mappedFolder: target, reused: false };
    }

    candidates.sort((a, b) => a.length - b.length || a.localeCompare(b));
    return { ruleId, defaultFolder: target, mappedFolder: candidates[0], reused: true };
  });
}

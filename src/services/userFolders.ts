/** 库内用户文件夹信息（已剔除系统目录与排除清单命中项） */
export interface UserFolder {
  path: string;
  /** 文件夹名称（路径末段） */
  name: string;
  /** 文件夹内 Markdown 笔记总数（含子文件夹） */
  noteCount: number;
}

/** 「从已有文件夹开始」分区的展示上限，超出截断并提示剩余数量 */
export const MAX_DISPLAY_FOLDERS = 50;

/**
 * 过滤并排序用户文件夹：
 * 剔除排除清单命中项与空路径，按路径字典序排列（与设置面板展示顺序一致）。
 * 纯函数：只读输入，零副作用。
 */
export function filterUserFolders(
  folders: { path: string; noteCount: number }[],
  excludedFolders: string[]
): UserFolder[] {
  return folders
    .filter((f) => f.path.length > 0 && !isExcluded(f.path, excludedFolders))
    .map((f) => ({
      path: f.path,
      name: f.path.split("/").pop() ?? f.path,
      noteCount: f.noteCount,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** 路径任一前缀命中排除清单，或任一段以 . 开头（隐藏/系统目录）即排除 */
function isExcluded(folderPath: string, excludedFolders: string[]): boolean {
  const parts = folderPath.split("/").filter(Boolean);
  if (parts.some((p) => p.startsWith("."))) return true;
  const excluded = new Set(excludedFolders.map((f) => f.trim()).filter(Boolean));
  for (let i = 0; i < parts.length; i++) {
    if (excluded.has(parts.slice(0, i + 1).join("/"))) return true;
  }
  return false;
}

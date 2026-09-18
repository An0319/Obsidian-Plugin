/** 库内用户文件夹信息（已剔除系统目录与排除清单命中项） */
export interface UserFolder {
  path: string;
  /** 文件夹名称（路径末段） */
  name: string;
  /** 文件夹内 Markdown 笔记总数（含子文件夹） */
  noteCount: number;
}

/** 树形节点：任意深度的用户文件夹 */
export interface UserFolderNode {
  path: string;
  name: string;
  noteCount: number;
  /** 相对库根的深度（一级 = 0） */
  depth: number;
}

/** 「从已有文件夹开始」分区的展示上限，超出截断并提示剩余数量 */
export const MAX_DISPLAY_FOLDERS = 50;

/** 树形展示的节点上限，超出时默认折叠非首级 */
export const MAX_TREE_NODES = 200;

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

/**
 * 过滤并排序任意深度的用户文件夹（树形展示数据源）：
 * 剔除排除命中分支与空路径，字典序排列保证父节点先于子节点出现，
 * depth 为路径段数 - 1。
 * 纯函数：只读输入，零副作用。
 */
export function filterUserFolderTree(
  folders: { path: string; noteCount: number }[],
  excludedFolders: string[]
): UserFolderNode[] {
  return folders
    .filter((f) => f.path.length > 0 && !isExcluded(f.path, excludedFolders))
    .map((f) => {
      const parts = f.path.split("/").filter(Boolean);
      return {
        path: f.path,
        name: parts[parts.length - 1] ?? f.path,
        noteCount: f.noteCount,
        depth: parts.length - 1,
      };
    })
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

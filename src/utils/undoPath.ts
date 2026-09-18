/**
 * 计算撤销恢复的目标路径：
 * 原路径空闲时直接返回；被占用时在主名后追加序号（如 「笔记 (1).md」）。
 * 纯函数：通过 exists 回调探测占用，只读输入，零副作用。
 */
export function resolveUndoPath(
  originalPath: string,
  exists: (path: string) => boolean
): string {
  if (!exists(originalPath)) return originalPath;
  const slash = originalPath.lastIndexOf("/");
  const dot = originalPath.lastIndexOf(".");
  const hasExt = dot > slash && dot !== -1;
  const dir = slash === -1 ? "" : originalPath.slice(0, slash + 1);
  const base = hasExt ? originalPath.slice(slash + 1, dot) : originalPath.slice(slash + 1);
  const ext = hasExt ? originalPath.slice(dot) : "";
  for (let i = 1; i < 100; i++) {
    const candidate = `${dir}${base} (${i})${ext}`;
    if (!exists(candidate)) return candidate;
  }
  return `${dir}${base} (restored)${ext}`;
}

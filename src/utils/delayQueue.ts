/**
 * 静默期队列纯函数：定时归档的核心判定逻辑。
 * 语义：每篇笔记独立计时，deadline = 最后活动时刻 + 静默期；
 * 修改/重命名会刷新活动时间（静默期从最后一次改动算起）。
 * 扫描与处理之间不共享可变状态，文件消失或离开 Inbox 即视为过期条目。
 */

/** 静默期队列：路径 -> 最后活动时间（毫秒时间戳） */
export type DelayQueue = Record<string, number>;

/**
 * 扫描队列：产出到期待处理路径与过期路径。
 * @param queue 当前队列（只读，本函数不修改）
 * @param inboxPaths 当前 Inbox 内的 Markdown 文件路径集合
 * @param now 当前时间（毫秒）
 * @param delayMs 静默期（毫秒），调用方保证 > 0
 */
export function scanDelayQueue(
  queue: DelayQueue,
  inboxPaths: Set<string>,
  now: number,
  delayMs: number
): { due: string[]; stale: string[] } {
  const due: string[] = [];
  const stale: string[] = [];
  for (const [path, lastActive] of Object.entries(queue)) {
    if (!inboxPaths.has(path)) {
      // 文件已被手动移走/删除/重命名：条目过期，静默退出队列
      stale.push(path);
      continue;
    }
    if (now - lastActive >= delayMs) {
      due.push(path);
    }
  }
  // 按放入顺序（最后活动时间）处理，先到先处理
  due.sort((a, b) => queue[a] - queue[b]);
  return { due, stale };
}

/** 记录一次活动：新建/修改/移入时刷新静默计时 */
export function touchQueueEntry(queue: DelayQueue, path: string, now: number): void {
  queue[path] = now;
}

/** 移除条目：处理完成（已移走）或显式出队时调用 */
export function removeQueueEntry(queue: DelayQueue, path: string): void {
  delete queue[path];
}

/** 重命名时转移计时：保留原静默进度，避免重命名重置冷却期 */
export function renameQueueEntry(
  queue: DelayQueue,
  oldPath: string,
  newPath: string
): boolean {
  if (!(oldPath in queue)) return false;
  if (newPath !== oldPath) {
    if (newPath in queue) {
      // 目标已有计时（视为另一篇独立笔记）：只清掉旧路径条目
      delete queue[oldPath];
      return true;
    }
    queue[newPath] = queue[oldPath];
    delete queue[oldPath];
  }
  return true;
}

import { describe, expect, it } from "vitest";
import {
  type DelayQueue,
  scanDelayQueue,
  touchQueueEntry,
  removeQueueEntry,
  renameQueueEntry,
} from "../src/utils/delayQueue";

describe("delayQueue", () => {
  const now = 1_000_000;
  const delayMs = 60_000;

  it("到期判定：deadline = lastActive + delay", () => {
    const queue = {
      "a.md": now - delayMs - 1,
      "b.md": now - delayMs,
      "c.md": now - delayMs + 1000,
    };
    const { due } = scanDelayQueue(queue, new Set(["a.md", "b.md", "c.md"]), now, delayMs);
    // 恰好等于期限即到期（>= 语义），按 lastActive 升序：最早的 a 先出
    expect(due).toEqual(["a.md", "b.md"]);
  });

  it("stale 清理：不在 Inbox（手动搬走/删除）与空路径条目", () => {
    const queue = {
      "a.md": now - 1000,
      "b.md": now - 1000,
      "": now - 1000,
    };
    const { due, stale } = scanDelayQueue(queue, new Set(["a.md"]), now, delayMs);
    expect(due).toEqual([]);
    expect(stale).toEqual(["b.md", ""]);
  });

  it("delayMs=0 时全部立即到期", () => {
    const queue = { "a.md": now, "b.md": now };
    const { due, stale } = scanDelayQueue(queue, new Set(["a.md", "b.md"]), now, 0);
    expect(due).toEqual(["a.md", "b.md"]);
    expect(stale).toEqual([]);
  });

  it("touchQueueEntry 原地刷新计时，未知路径同样入队", () => {
    const queue: DelayQueue = { "a.md": 1 };
    touchQueueEntry(queue, "a.md", now);
    expect(queue["a.md"]).toBe(now);
    touchQueueEntry(queue, "b.md", now + 5);
    expect(queue["b.md"]).toBe(now + 5);
  });

  it("removeQueueEntry 原地删除条目，未知路径无副作用", () => {
    const queue: DelayQueue = { "a.md": 1, "b.md": 2 };
    removeQueueEntry(queue, "a.md");
    expect(queue).toEqual({ "b.md": 2 });
    removeQueueEntry(queue, "missing.md");
    expect(queue).toEqual({ "b.md": 2 });
  });

  it("renameQueueEntry 原地转移计时；目标已存在时保留目标计时并清掉旧条目", () => {
    const queue: DelayQueue = { "old.md": 42, "keep.md": 7 };
    expect(renameQueueEntry(queue, "old.md", "new.md")).toBe(true);
    expect(queue["new.md"]).toBe(42);
    expect(queue["old.md"]).toBeUndefined();

    // 目标已存在：视为另一篇独立笔记，保留其计时
    const clash: DelayQueue = { "a.md": 1, "b.md": 2 };
    expect(renameQueueEntry(clash, "a.md", "b.md")).toBe(true);
    expect(clash["b.md"]).toBe(2);
    expect(clash["a.md"]).toBeUndefined();

    // 源不存在：不动队列
    const empty: DelayQueue = {};
    expect(renameQueueEntry(empty, "x.md", "y.md")).toBe(false);
    expect(empty).toEqual({});
  });
});

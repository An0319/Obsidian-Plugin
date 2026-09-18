import { describe, expect, it } from "vitest";
import { resolveUndoPath } from "../src/utils/undoPath";

describe("resolveUndoPath", () => {
  it("原路径空闲时直接返回", () => {
    expect(resolveUndoPath("笔记.md", () => false)).toBe("笔记.md");
    expect(resolveUndoPath("归档/笔记.md", () => false)).toBe("归档/笔记.md");
  });

  it("冲突时在同目录主名后追加 (1)", () => {
    const result = resolveUndoPath("归档/笔记.md", (p) => p === "归档/笔记.md");
    expect(result).toBe("归档/笔记 (1).md");
  });

  it("连续冲突时序号递增", () => {
    const taken = new Set(["笔记.md", "笔记 (1).md"]);
    const result = resolveUndoPath("笔记.md", (p) => taken.has(p));
    expect(result).toBe("笔记 (2).md");
  });

  it("无扩展名路径追加序号到主名末尾", () => {
    const result = resolveUndoPath("归档/文件夹", (p) => p === "归档/文件夹");
    expect(result).toBe("归档/文件夹 (1)");
  });

  it("根目录文件（无目录前缀）正确处理", () => {
    const result = resolveUndoPath("a.md", (p) => p === "a.md" || p === "a (1).md");
    expect(result).toBe("a (2).md");
  });
});

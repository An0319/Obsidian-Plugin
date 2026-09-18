import { describe, expect, it } from "vitest";
import {
  MAX_DISPLAY_FOLDERS,
  MAX_TREE_NODES,
  filterUserFolderTree,
  filterUserFolders,
} from "../src/services/userFolders";

describe("userFolders", () => {
  describe("filterUserFolders", () => {
    it("剔除系统目录、隐藏目录与排除清单命中项", () => {
      const folders = [
        { path: ".obsidian", noteCount: 0 },
        { path: ".trash", noteCount: 3 },
        { path: "attachments", noteCount: 0 },
        { path: "模板", noteCount: 2 },
        { path: "工作", noteCount: 10 },
        { path: "工作/.内部", noteCount: 1 },
      ];
      const result = filterUserFolders(folders, ["attachments", "模板"]);
      expect(result.map((f) => f.path)).toEqual(["工作"]);
    });

    it("路径任一段以 . 开头即排除", () => {
      const folders = [
        { path: ".hidden", noteCount: 5 },
        { path: "正常", noteCount: 2 },
      ];
      const result = filterUserFolders(folders, []);
      expect(result.map((f) => f.path)).toEqual(["正常"]);
    });

    it("空路径被剔除，name 取路径末段", () => {
      const result = filterUserFolders(
        [
          { path: "", noteCount: 1 },
          { path: "笔记/项目/研发", noteCount: 7 },
        ],
        []
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("研发");
      expect(result[0].noteCount).toBe(7);
    });

    it("按路径字典序排列（展示顺序一致）", () => {
      const result = filterUserFolders(
        [
          { path: "日记", noteCount: 9 },
          { path: "Archive", noteCount: 20 },
          { path: "工作", noteCount: 5 },
        ],
        []
      );
      expect(result.map((f) => f.path)).toEqual(["Archive", "工作", "日记"]);
    });

    it("排除清单匹配前缀路径（父目录命中则整体排除）", () => {
      const result = filterUserFolders(
        [
          { path: "私密/子目录", noteCount: 3 },
          { path: "私密", noteCount: 8 },
          { path: "公开", noteCount: 1 },
        ],
        ["私密"]
      );
      expect(result.map((f) => f.path)).toEqual(["公开"]);
    });

    it("展示上限常量为 50", () => {
      expect(MAX_DISPLAY_FOLDERS).toBe(50);
    });
  });

  describe("filterUserFolderTree", () => {
    it("depth 为路径段数减一，name 取末段", () => {
      const result = filterUserFolderTree(
        [
          { path: "工作", noteCount: 10 },
          { path: "工作/项目", noteCount: 6 },
          { path: "工作/项目/研发", noteCount: 3 },
        ],
        []
      );
      expect(result.map((n) => n.depth)).toEqual([0, 1, 2]);
      expect(result[2].name).toBe("研发");
    });

    it("父目录命中排除清单时整支排除", () => {
      const result = filterUserFolderTree(
        [
          { path: "私密", noteCount: 5 },
          { path: "私密/子", noteCount: 2 },
          { path: "公开", noteCount: 1 },
        ],
        ["私密"]
      );
      expect(result.map((n) => n.path)).toEqual(["公开"]);
    });

    it("字典序排列保证父节点先于子节点", () => {
      const result = filterUserFolderTree(
        [
          { path: "B", noteCount: 1 },
          { path: "A/B/C", noteCount: 1 },
          { path: "A", noteCount: 2 },
          { path: "A/B", noteCount: 3 },
        ],
        []
      );
      expect(result.map((n) => n.path)).toEqual(["A", "A/B", "A/B/C", "B"]);
    });

    it("树形节点上限常量为 200", () => {
      expect(MAX_TREE_NODES).toBe(200);
    });
  });
});

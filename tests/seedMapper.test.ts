import { describe, it, expect } from "vitest";
import {
  SEED_ALIASES,
  isFolderExcluded,
  mapSeedFolders,
} from "../src/services/seedMapping";

const seedTargets = [
  { ruleId: "seed-journal", defaultFolder: "日志" },
  { ruleId: "seed-archive", defaultFolder: "归档" },
  { ruleId: "seed-inbox-fallback", defaultFolder: "收件箱" },
];

describe("seedFolderMapper", () => {
  describe("isFolderExcluded", () => {
    it("隐藏目录（. 开头）被排除", () => {
      expect(isFolderExcluded(".obsidian", [])).toBe(true);
      expect(isFolderExcluded("笔记/.trash 子目录", [])).toBe(true);
    });

    it("排除列表前缀段命中即排除", () => {
      expect(isFolderExcluded("模板/日常", ["模板"])).toBe(true);
      expect(isFolderExcluded("笔记", ["笔记"])).toBe(true);
      expect(isFolderExcluded("笔记/子目录", ["笔记"])).toBe(true);
    });

    it("正常文件夹保留", () => {
      expect(isFolderExcluded("日志", ["模板", "attachments"])).toBe(false);
      expect(isFolderExcluded("PARA/Projects", [])).toBe(false);
    });
  });

  describe("mapSeedFolders", () => {
    it("库内无相近文件夹时保留默认目标", () => {
      const result = mapSeedFolders(["PARA/Projects", "笔记"], seedTargets, []);
      expect(result).toHaveLength(3);
      expect(result.every((r) => !r.reused)).toBe(true);
      expect(result.map((r) => r.mappedFolder)).toEqual(["日志", "归档", "收件箱"]);
    });

    it("名称精确匹配复用已有文件夹", () => {
      const result = mapSeedFolders(["日志", "归档", "收件箱"], seedTargets, []);
      expect(result.every((r) => r.reused)).toBe(true);
      expect(result.map((r) => r.mappedFolder)).toEqual(["日志", "归档", "收件箱"]);
    });

    it("英文别名命中（大小写不敏感）", () => {
      const result = mapSeedFolders(["Daily", "Archive", "Inbox"], seedTargets, []);
      expect(result.map((r) => r.mappedFolder)).toEqual(["Daily", "Archive", "Inbox"]);
      expect(result.every((r) => r.reused)).toBe(true);
    });

    it("别名表全量覆盖三种子规则", () => {
      for (const [target, aliases] of Object.entries(SEED_ALIASES)) {
        for (const alias of aliases) {
          const targets = seedTargets.filter((t) => t.defaultFolder === target);
          const result = mapSeedFolders([alias], targets, []);
          expect(result[0].reused).toBe(true);
          expect(result[0].mappedFolder).toBe(alias);
        }
      }
    });

    it("匹配末段：嵌套路径中的同名文件夹命中", () => {
      const result = mapSeedFolders(["个人/日记"], [{ ruleId: "j", defaultFolder: "日志" }], []);
      expect(result[0].reused).toBe(true);
      expect(result[0].mappedFolder).toBe("个人/日记");
    });

    it("多命中取路径最短（最顶层）", () => {
      const result = mapSeedFolders(
        ["Archive/2025", "Archive", "笔记/Archive"],
        [{ ruleId: "a", defaultFolder: "归档" }],
        []
      );
      expect(result[0].mappedFolder).toBe("Archive");
    });

    it("排除文件夹不参与映射", () => {
      const result = mapSeedFolders(["attachments/Archive"], seedTargets, ["attachments"]);
      expect(result.find((r) => r.ruleId === "seed-archive")?.reused).toBe(false);
    });

    it("映射只读：输入文件夹列表不被修改", () => {
      const folders = ["日志", "Archive"];
      mapSeedFolders(folders, seedTargets, []);
      expect(folders).toEqual(["日志", "Archive"]);
    });
  });
});

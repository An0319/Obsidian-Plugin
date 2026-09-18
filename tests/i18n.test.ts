import { beforeEach, describe, expect, it } from "vitest";
import { zh } from "../src/i18n/zh";
import { en } from "../src/i18n/en";
import { resolveLocale, setLocale, t } from "../src/i18n";
import { setMockLocale } from "./mocks/obsidian";

describe("i18n", () => {
  describe("字典完整性", () => {
    it("en 的每个 key 都存在于 zh（en 为 Partial 回退）", () => {
      for (const key of Object.keys(en)) {
        expect(zh).toHaveProperty(key);
      }
    });

    it("zh 所有文案为非空字符串", () => {
      for (const [key, value] of Object.entries(zh)) {
        expect(typeof value, key).toBe("string");
        expect((value as string).length, key).toBeGreaterThan(0);
      }
    });
  });

  describe("t()", () => {
    beforeEach(() => {
      setMockLocale("zh");
      setLocale("zh");
    });

    it("中文取 zh 文案", () => {
      expect(t("common.cancel")).toBe("取消");
    });

    it("英文取 en 文案，缺失时回退 zh", () => {
      setLocale("en");
      expect(t("common.cancel")).toBe("Cancel");
      expect(t("report.moved", { n: 3 })).toBe("3 moved");
    });

    it("占位符替换：{n} 被参数填充", () => {
      expect(t("report.moved", { n: 5 })).toBe("已移动 5 篇");
      expect(t("report.kept", { n: 0 })).toBe("保留原位 0 篇");
    });

    it("占位符缺参时保留原样，不抛错", () => {
      expect(t("report.moved")).toBe("已移动 {n} 篇");
    });

    it("未注册 key 返回 key 本身，绝不抛错", () => {
      const unknown = "totally.missing.key" as Parameters<typeof t>[0];
      expect(t(unknown)).toBe("totally.missing.key");
    });
  });

  describe("resolveLocale", () => {
    it("显式 zh/en 直接返回", () => {
      expect(resolveLocale("zh")).toBe("zh");
      expect(resolveLocale("en")).toBe("en");
    });

    it("auto 时跟随模拟的 Obsidian 界面语言", () => {
      setMockLocale("zh-cn");
      expect(resolveLocale("auto")).toBe("zh");
      setMockLocale("en");
      expect(resolveLocale("auto")).toBe("en");
    });
  });
});

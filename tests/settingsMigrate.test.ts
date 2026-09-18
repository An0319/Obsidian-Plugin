import { describe, expect, it } from "vitest";
import {
  AutoOrganizeMode,
  DEFAULT_SETTINGS,
  migrateSettings,
} from "../src/settings/settings";

describe("migrateSettings", () => {
  it("非对象输入返回默认设置", () => {
    for (const raw of [null, undefined, "x", 42]) {
      const result = migrateSettings(raw);
      expect(result.autoOrganizeMode).toBe(DEFAULT_SETTINGS.autoOrganizeMode);
      expect(result.inboxFolder).toBe("Inbox");
    }
  });

  it("旧布尔 autoOrganize true 迁移为 Move，false 迁移为 Off", () => {
    expect(migrateSettings({ autoOrganize: true }).autoOrganizeMode).toBe(
      AutoOrganizeMode.Move
    );
    expect(migrateSettings({ autoOrganize: false }).autoOrganizeMode).toBe(
      AutoOrganizeMode.Off
    );
  });

  it("迁移后旧字段 autoOrganize 被移除", () => {
    const result = migrateSettings({ autoOrganize: true });
    expect("autoOrganize" in result).toBe(false);
  });

  it("已有 autoOrganizeMode 优先于旧布尔值", () => {
    const result = migrateSettings({
      autoOrganize: true,
      autoOrganizeMode: AutoOrganizeMode.Notify,
    });
    expect(result.autoOrganizeMode).toBe(AutoOrganizeMode.Notify);
  });

  it("非法 autoOrganizeMode（越界数字/字符串）回落默认 Move", () => {
    expect(migrateSettings({ autoOrganizeMode: 99 }).autoOrganizeMode).toBe(
      AutoOrganizeMode.Move
    );
    expect(migrateSettings({ autoOrganizeMode: "2" }).autoOrganizeMode).toBe(
      AutoOrganizeMode.Move
    );
  });

  it("非法 locale 回落 auto，合法 locale 保留", () => {
    expect(migrateSettings({ locale: "fr" }).locale).toBe("auto");
    expect(migrateSettings({ locale: 42 }).locale).toBe("auto");
    expect(migrateSettings({ locale: "zh" }).locale).toBe("zh");
    expect(migrateSettings({ locale: "en" }).locale).toBe("en");
  });

  it("lastSettingsTab 为空/非字符串回落 quickstart，合法值保留", () => {
    expect(migrateSettings({ lastSettingsTab: "" }).lastSettingsTab).toBe("quickstart");
    expect(migrateSettings({ lastSettingsTab: 123 }).lastSettingsTab).toBe("quickstart");
    expect(migrateSettings({ lastSettingsTab: "rulesFolders" }).lastSettingsTab).toBe(
      "rulesFolders"
    );
  });

  it("其余字段原样透传，输入对象不被修改", () => {
    const raw = {
      engineLevel: 2,
      tfidfThreshold: 0.5,
      inboxFolder: "收集箱",
      autoOrganize: false,
      locale: "en",
    };
    const result = migrateSettings(raw);
    expect(result.engineLevel).toBe(2);
    expect(result.tfidfThreshold).toBe(0.5);
    expect(result.inboxFolder).toBe("收集箱");
    expect(result.autoOrganizeMode).toBe(AutoOrganizeMode.Off);
    expect("autoOrganizeMode" in raw).toBe(false);
    expect("autoOrganize" in raw).toBe(true);
  });
});

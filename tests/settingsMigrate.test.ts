import { describe, expect, it } from "vitest";
import {
  AutoOrganizeMode,
  DEFAULT_SETTINGS,
  SmartNotesSettings,
  migrateSettings,
  migrateLegacySeedRules,
} from "../src/settings/settings";
import { defaultRules } from "../src/engines/ruleEngine";

/** 构造老版本用户设置：收件箱兜底硬编码「收件箱」、陈旧归档启用 */
function legacySettings(): SmartNotesSettings {
  const settings = migrateSettings({
    rules: defaultRules().map((r) => {
      if (r.id === "seed-archive") return { ...r, enabled: true };
      if (r.id === "seed-inbox-fallback") return { ...r, targetFolder: "收件箱" };
      return r;
    }),
    legacySeedMigrated: false,
  });
  return settings;
}

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

  it("legacySeedMigrated 缺失时回落 false", () => {
    expect(migrateSettings({}).legacySeedMigrated).toBe(false);
    expect(migrateSettings({ legacySeedMigrated: "yes" }).legacySeedMigrated).toBe(false);
    expect(migrateSettings({ legacySeedMigrated: true }).legacySeedMigrated).toBe(true);
  });

  it("0.3.8 智能默认值迁移：旧默认层级一与阈值 0.3 一次性升级", () => {
    const result = migrateSettings({
      engineLevel: 1,
      tfidfThreshold: 0.3,
      smartEngineMigrated: false,
    });
    expect(result.engineLevel).toBe(DEFAULT_SETTINGS.engineLevel);
    expect(result.tfidfThreshold).toBe(0.2);
    expect(result.smartEngineMigrated).toBe(true);
  });

  it("0.3.8 迁移尊重用户手动调整过的层级与阈值", () => {
    const result = migrateSettings({
      engineLevel: 3,
      tfidfThreshold: 0.35,
      smartEngineMigrated: false,
    });
    expect(result.engineLevel).toBe(3);
    expect(result.tfidfThreshold).toBe(0.35);
  });

  it("0.3.8 迁移幂等：标志位已置则不再改动", () => {
    const result = migrateSettings({
      engineLevel: 1,
      tfidfThreshold: 0.3,
      smartEngineMigrated: true,
    });
    expect(result.engineLevel).toBe(1);
    expect(result.tfidfThreshold).toBe(0.3);
  });

  it("smartEngineMigrated 缺失时视为未迁移：迁移执行并置位", () => {
    // 首次加载即完成一次性迁移
    expect(migrateSettings({}).smartEngineMigrated).toBe(true);
    expect(migrateSettings({ smartEngineMigrated: "x" }).smartEngineMigrated).toBe(true);
    // 已置位则原样保留
    expect(migrateSettings({ smartEngineMigrated: true }).smartEngineMigrated).toBe(true);
  });
});

describe("migrateLegacySeedRules", () => {
  it("老版收件箱兜底目标改写为 {inbox} 占位符", () => {
    const settings = legacySettings();
    const { migrated } = migrateLegacySeedRules(settings);
    const fallback = settings.rules.find((r) => r.id === "seed-inbox-fallback");
    expect(migrated).toBe(true);
    expect(fallback?.targetFolder).toBe("{inbox}");
  });

  it("老版启用的陈旧归档规则被停用并上报 archiveDisabled", () => {
    const settings = legacySettings();
    const { migrated, archiveDisabled } = migrateLegacySeedRules(settings);
    const archive = settings.rules.find((r) => r.id === "seed-archive");
    expect(migrated).toBe(true);
    expect(archiveDisabled).toBe(true);
    expect(archive?.enabled).toBe(false);
  });

  it("迁移幂等：标记置位后二次调用不再改动", () => {
    const settings = legacySettings();
    migrateLegacySeedRules(settings);
    const archive = settings.rules.find((r) => r.id === "seed-archive");
    archive!.enabled = true;
    const second = migrateLegacySeedRules(settings);
    expect(second.migrated).toBe(false);
    expect(second.archiveDisabled).toBe(false);
    expect(archive?.enabled).toBe(true);
  });

  it("新默认规则已是目标形态：迁移无动作、无提示", () => {
    const settings = migrateSettings({});
    const { migrated, archiveDisabled } = migrateLegacySeedRules(settings);
    expect(migrated).toBe(false);
    expect(archiveDisabled).toBe(false);
    const fallback = settings.rules.find((r) => r.id === "seed-inbox-fallback");
    const archive = settings.rules.find((r) => r.id === "seed-archive");
    expect(fallback?.targetFolder).toBe("{inbox}");
    expect(archive?.enabled).toBe(false);
  });

  it("用户自定义目标不被改写", () => {
    const settings = migrateSettings({
      legacySeedMigrated: false,
      rules: [
        {
          id: "seed-inbox-fallback",
          name: "收件箱兜底",
          field: "filename",
          operator: "always",
          pattern: "",
          targetFolder: "待处理",
          enabled: true,
        },
      ],
    });
    const { migrated } = migrateLegacySeedRules(settings);
    expect(migrated).toBe(false);
    expect(settings.rules[0].targetFolder).toBe("待处理");
  });
});

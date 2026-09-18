import { moment } from "obsidian";
import { zh, I18nKey } from "./zh";
import { en } from "./en";

export type { I18nKey };

export type Locale = "zh" | "en" | "auto";

let current: "zh" | "en" = "zh";

/** 按设置解析实际语言；auto 时跟随 Obsidian 界面语言 */
export function resolveLocale(locale: Locale): "zh" | "en" {
  if (locale === "zh" || locale === "en") return locale;
  return moment.locale().startsWith("zh") ? "zh" : "en";
}

/** 设置当前语言（设置面板切换时调用，随后重渲染） */
export function setLocale(locale: Locale): void {
  current = resolveLocale(locale);
}

/** 初始化语言（插件加载时调用） */
export function initLocale(locale: Locale): void {
  current = resolveLocale(locale);
}

/**
 * 取文案：英文缺失时回退中文；key 未注册时返回 key 本身，绝不抛错。
 * 支持占位符替换：{n} {name} 等。
 */
export function t(
  key: I18nKey,
  params?: Record<string, string | number>
): string {
  const raw = (current === "en" ? en[key] : undefined) ?? zh[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

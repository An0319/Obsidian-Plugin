/**
 * 测试专用 obsidian 运行时桩：obsidian npm 包仅含类型声明（main 为空），
 * 凡源码在模块顶层 import { ... } from "obsidian" 的，均经由 vitest 别名指向本文件。
 * 保持最小实现，按需补充。
 */

let mockLocale = "en";

/** 供测试切换模拟的界面语言（auto 跟随逻辑依赖 locale() 返回值） */
export function setMockLocale(locale: string): void {
  mockLocale = locale;
}

export const moment = {
  locale: (locale?: string): string => {
    if (locale !== undefined) mockLocale = locale;
    return mockLocale;
  },
};

# Requirements Document — 文件夹规则引导与设置体验优化

Feature Name: folder-rules-ux
Updated: 2026-09-16
Status: Confirmed（用户已确认三个方向）

## Introduction

V0.2 真机验证反馈：用户找不到「复用已有文件夹」功能的入口，设置面板缺少库内已有文件夹的可视化表现；设置文案混杂编程符号（JSON 花括号等），普通用户难以理解；缺少 custom_rules.json 样例文件导致导入功能无法体验。

本规格覆盖：
1. 库内已有文件夹扫描展示 + 一键建规则草稿（半自动）
2. custom_rules.json 样例文件一键生成
3. 设置面板与 README 文案通俗化（去编程符号）

## Glossary

- **用户文件夹**：库内一级文件夹中，排除清单之外的文件夹（排除 .obsidian、.trash、用户排除目录）
- **笔记数量**：文件夹及其子文件夹内 Markdown 笔记的总数
- **规则草稿**：目标文件夹已预填、匹配条件为建议值、待用户确认修改的整理规则
- **样例文件**：包含 2 条示例规则与通俗说明的 custom_rules.json 文件

## Requirements

### R1: 库内已有文件夹扫描展示

**User Story:** 作为存量库用户，我希望在设置面板看到库内已有的文件夹及其笔记数量，以便了解插件可以利用哪些现有结构。

#### Acceptance Criteria

1. WHEN 用户打开设置面板，插件 SHALL 在「从已有文件夹开始」分区列出库内全部用户文件夹，按字母顺序排列。
2. WHEN 插件展示用户文件夹，插件 SHALL 在每个文件夹旁显示该文件夹的笔记数量。
3. IF 文件夹路径命中排除清单或为系统目录（.obsidian、.trash），插件 SHALL 将该文件夹从列表中隐藏。
4. IF 用户文件夹数量超过 50 个，插件 SHALL 仅展示前 50 个并显示剩余数量提示。

### R2: 一键建规则草稿

**User Story:** 作为存量库用户，我希望基于某个已有文件夹快速创建整理规则，以便插件按我的现有结构整理笔记。

#### Acceptance Criteria

1. WHEN 用户点击某用户文件夹旁的「建规则」按钮，插件 SHALL 打开规则编辑器并将目标文件夹预填为该文件夹路径。
2. WHEN 规则编辑器由「建规则」按钮打开，插件 SHALL 将匹配字段预填为「文件名」、匹配内容预填为该文件夹名称，作为可修改的起点建议。
3. WHEN 用户在规则编辑器中保存规则草稿，插件 SHALL 将规则追加到规则列表并刷新设置面板展示。

### R3: custom_rules.json 样例文件一键生成

**User Story:** 作为普通用户，我希望一键获得一份可直接修改的规则文件样例，以便无需了解文件格式就能体验导入功能。

#### Acceptance Criteria

1. WHEN 用户点击「生成样例文件」按钮且库根不存在 custom_rules.json，插件 SHALL 在库根创建包含 2 条示例规则与通俗说明的 custom_rules.json。
2. IF 库根已存在 custom_rules.json，插件 SHALL 弹出确认对话框说明覆盖风险，用户确认后 SHALL 用样例内容覆盖该文件。
3. WHEN 样例文件创建成功，插件 SHALL 显示成功提示，提示内容包含下一步指引（修改后点导入）。
4. IF 样例文件写入失败（如库为只读），插件 SHALL 显示失败原因，插件 SHALL 保持原文件不变。

### R4: 设置面板文案通俗化

**User Story:** 作为不熟悉编程的普通用户，我希望设置面板的说明使用日常语言，以便理解每个功能的作用和操作步骤。

#### Acceptance Criteria

1. WHEN 设置面板渲染任意功能说明文字，说明文字 SHALL 使用面向普通用户的日常语言。
2. 插件 SHALL 在设置面板文案中避免出现 JSON 语法符号（花括号、方括号、引号）与编程术语，改用通俗说法。
3. 插件 SHALL 为设置面板每个功能分区提供一句话说明，说明格式 SHALL 统一为「功能作用 + 操作方式」。
4. WHEN 插件描述种子规则导入的复用行为，文案 SHALL 明确说明「库里已有同名文件夹时自动使用现有文件夹」。

### R5: README 同步通俗化

**User Story:** 作为从 GitHub 了解插件的潜在用户，我希望 README 的功能说明与设置面板口径一致，以便快速上手。

#### Acceptance Criteria

1. WHEN README 描述设置面板相关功能，README SHALL 使用与设置面板一致的通俗说法。
2. README SHALL 保留 custom_rules.json 的完整格式示例代码块，作为进阶参考。
3. README SHALL 在格式示例前提供通俗的分步引导，引导内容 SHALL 覆盖「一键生成样例文件」的操作路径。

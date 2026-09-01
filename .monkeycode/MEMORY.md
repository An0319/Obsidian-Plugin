# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Format

### User Instruction Entry
User instruction entries should follow this format:

[User Instruction Summary]
- Date: [YYYY-MM-DD]
- Context: [Mentioned scenario or time]
- Instructions:
  - [Content of user teaching or instruction, described line by line]

### Project Knowledge Entry
Entries discovered by the Agent during task execution should follow this format:

[Project Knowledge Summary]
- Date: [YYYY-MM-DD]
- Context: Discovered by Agent while performing [specific task description]
- Category: [Operations & Deployment|Build Methods|Testing Methods|Troubleshooting & Debugging|Workflow & Collaboration|Environment Configuration]
- Instructions:
  - [Specific knowledge points, described line by line]

## Deduplication Strategy
- Before adding a new entry, check for similar or identical instructions.
- If a duplicate is found, skip the new entry or merge it with the existing one.
- When merging, update the context or date information.
- This helps avoid redundant entries and keeps the memory file tidy.

## Entries

[Git Workflow: Commit and Push Every Batch]
- Date: 2026-09-01
- Context: 用户在 Obsidian 智能笔记整理插件项目完成首批代码提交时提出
- Instructions:
  - 每批代码或文件完成后，必须提交到 git 仓库并同步推送到远程仓库（origin: https://github.com/An0319/Obsidian-Plugin）
  - 推送前先在 main 分支上切出规范命名的功能分支（YYMMDD-feat/fix/chore-描述）

[Build & Test Commands]
- Date: 2026-09-01
- Context: Agent 执行构建与测试验证时发现
- Category: Build Methods
- Instructions:
  - 构建命令：npm run build（tsc 类型检查 + esbuild 压缩产出 main.js）
  - 测试命令：npm test（Vitest，6 个文件 56 个用例）
  - npm install/build/test 必须使用 background_terminal_create 执行（环境内存约 7965MB）
  - main.js 为构建产物，已被 .gitignore 排除，通过 GitHub Release 分发

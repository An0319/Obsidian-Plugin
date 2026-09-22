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
  - main.js 为构建产物，当前被 git 跟踪且随 main 分支提交（.gitignore 无排除条目）；正式 Release 资产由 GitHub Actions 分发，V0.3 上架前建议取消跟踪并补 .gitignore（需用户确认，涉及 git rm --cached）
  - 本仓库托管在 GitHub（An0319/Obsidian-Plugin），push options 的 merge_request.create 为 GitLab 语法，GitHub 上无效；PR 需 gh CLI（未认证）或用户手动创建
  - 推送后必须用 git ls-remote 比对本地与远程 hash 确认推送成功（曾遇 HTTP 500 瞬时失败，重试即可）

[测试中 obsidian 模块需经桩替换]
- Date: 2026-09-18
- Context: V0.3 为 i18n 写测试时发现 obsidian npm 包 main 为空（仅类型声明），源码顶层 import "obsidian" 的模块无法直接在 vitest 中加载
- Category: Testing Methods
- Instructions:
  - vitest.config.ts 已配置 resolve.alias：obsidian → tests/mocks/obsidian.ts
  - 桩内提供可配置的 moment.locale()（setMockLocale），供 resolveLocale("auto") 跟随逻辑测试
  - 新增涉及 obsidian 运行时 API 的测试一律走该别名，直接 import 会 ERR_MODULE_NOT_FOUND

[TF-IDF 离线评测 harness 与黄金阈值区间]
- Date: 2026-09-22
- Context: V0.3.4 实施 TF-IDF 鲁棒性修复与三层检验方案时建立
- Category: Build Methods
- Instructions:
  - 评测命令：npm run eval:tfidf（esbuild 打包 scripts/eval-tfidf.ts 到 node_modules/.cache 后用 node 运行，不依赖 Obsidian）
  - 方法：合成 6 领域语料（mulberry32 种子 20260922 可复现）+ 留出法 + 阈值 0.10-0.90 扫描
  - 实测结论：阈值 0.15-0.35 为黄金区间（域内准确率 100% + 域外 100% 正确拒绝）；默认 0.3 在区间右缘；0.10 以下域外误投 95%；0.40 起准确率衰减
  - 单篇分析约 0.09ms、180 篇语料构建约 7ms，计算性能有大量余量
  - 降级链语义（0.3.4 起）：引擎返回空建议视为弃权并继续尝试下一层（规则兜底生效）；全部弃权时返回最智能引擎的空建议保留理由

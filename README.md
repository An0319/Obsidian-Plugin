# Obsidian 智能笔记整理插件（Smart Notes Organizer）

为 Obsidian 提供无需付费 API、不强制依赖本地 AI 模型的智能笔记自动分类与文件夹整理能力。通过四层可切换的整理引擎，覆盖从低配到高配设备的所有用户，实现"零操作、自动归类、尊重用户习惯"。

## 功能特性

- 监控 Vault 中的新笔记与未整理笔记，自动分析内容并给出目标文件夹建议
- 移动前可预览建议、修改目标路径或一键确认
- 自动创建缺失的文件夹；移动通过 `app.fileManager.renameFile` 执行，由 Obsidian 自动更新所有内部链接（`[[引用]]`）
- 记录最近 200 次整理操作到插件目录（`organize-log.json`），便于追溯
- 所有数据本地处理，不上传任何外部服务

## 四层引擎

| 层级 | 名称 | 适用场景 | 原理 |
|------|------|----------|------|
| 一 | 规则映射 | 所有设备，零门槛 | 关键词/标签/路径匹配规则，按优先级顺序命中 |
| 二 | TF-IDF 智能匹配 | 任意电脑，无需 AI 模型 | 手写 TF-IDF + 余弦相似度，将新笔记与文件夹特征向量匹配 |
| 三 | 本地大模型 | 高配设备，需 [Ollama](https://ollama.com) | 调用本地 Ollama（默认 qwen2.5:7b）做语义分类 |
| 四 | 社区共享配置 | 低配设备零计算 | 导入他人导出的规则集 + 预计算文件夹向量，直接应用 |

降级机制：层级三失败（Ollama 未运行/超时）自动降级到层级二，再降级到层级一。

## 安装使用

1. 构建插件（见下方"开发"），将 `main.js`、`manifest.json`、`styles.css`（如有）复制到
   `<你的库>/.obsidian/plugins/obsidian-smart-notes/`
2. 在 Obsidian 设置 → 第三方插件中启用"Smart Notes Organizer"
3. 默认启用层级一（规则映射）并内置通用模板规则，开箱即用

### 命令

| 命令 | 说明 |
|------|------|
| 整理当前笔记 | 分析当前文件并按设置执行移动（含确认弹窗） |
| 预览当前笔记的整理建议 | 只展示建议与依据，执行移动 |
| 立即整理 Inbox | 批量整理 Inbox（或全库）内所有笔记，带进度提示 |
| 重建层级二特征缓存 | 手动刷新文件夹特征向量 |

### 设置项

- **引擎选择**：层级一 / 二 / 三 / 四
- **层级一**：规则列表增删改，支持上下移动排序（顺序即优先级）、一键导入内置模板
- **层级二**：相似度阈值滑动条（0.1~0.9，默认 0.3）、参与计算的笔记上限、手动重建缓存
- **层级三**：Ollama 地址（默认 `http://localhost:11434`）、模型名（默认 `qwen2.5:7b`）、超时、连接测试、失败自动降级开关
- **层级四**：导入 JSON 配置文件 / 一键导入内置示例配置 / 导出当前配置供分享
- **通用**：自动整理开关、移动前确认、Inbox 文件夹名、未归类兜底文件夹、排除文件夹列表、日志开关

## 规则语法（层级一 / 层级四）

每条规则包含：

- **匹配字段**：标题 / 笔记内容 / 标签 / 文件名
- **匹配方式**：包含 / 等于 / 正则表达式（大小写不敏感）
- **目标文件夹**：相对 Vault 根目录的路径，如 `02-战略/竞品`
- **权重**（可选，共享配置携带）：作为命中置信度

示例：

- 内容包含 `投资` → 移入 `投资笔记`
- 标签等于 `todo` → 移入 `待办`
- 文件名匹配 `^\d{4}-\d{2}-\d{2}$` → 移入 `日记`

## 共享配置文件（层级四）

JSON 格式，包含规则列表、预计算的文件夹 TF-IDF 向量、全局 IDF 表与相似度阈值。高配用户（层级二 + 层级三组合）可在设置中"导出当前配置"生成文件并分享到社区；低配用户导入后即可零计算获得接近 AI 的分类效果。设置面板内置示例配置供测试。

## 开发

技术栈：TypeScript + esbuild（Obsidian 官方模板模式），层级二为手写算法零运行时依赖，层级三使用 Obsidian 原生 `requestUrl`，测试使用 Vitest。

```bash
# 安装依赖
npm install

# 开发模式（监听文件变化，输出 main.js）
npm run dev

# 类型检查 + 生产构建（压缩输出 main.js）
npm run build

# 运行单元测试
npm test
```

### 目录结构

```
├── manifest.json              # 插件清单
├── esbuild.config.mjs         # 构建配置
├── main.js                    # 构建产物
├── src/
│   ├── main.ts                # 插件入口：事件监听、命令注册、引擎装配
│   ├── types.ts               # 核心类型：IOrganizeEngine、规则、建议、共享配置
│   ├── engines/
│   │   ├── ruleEngine.ts      # 层级一：规则映射
│   │   ├── tfidf/
│   │   │   ├── tokenizer.ts   #   分词（中文二元组 + 英文单词）
│   │   │   ├── tfidf.ts       #   TF-IDF / 余弦相似度
│   │   │   └── tfidfEngine.ts # 层级二：智能匹配（TTL+签名双层缓存）
│   │   ├── ollamaEngine.ts    # 层级三：本地大模型
│   │   └── sharedModelEngine.ts # 层级四：社区共享配置
│   ├── scheduler/
│   │   ├── dispatcher.ts      # 引擎调度与降级链
│   │   └── organizerService.ts # 核心服务：分析、应用建议、批量整理
│   ├── services/
│   │   └── fileOrganizer.ts   # 文件夹创建、移动、链接更新、日志
│   ├── settings/
│   │   ├── settings.ts        # 设置数据结构与默认值
│   │   └── settingsTab.ts     # 设置面板 UI
│   └── utils/
│       └── helpers.ts         # 规则匹配、路径规范化等工具函数
└── tests/                     # Vitest 单元测试（56 个用例）
```

### 扩展新引擎

实现 `IOrganizeEngine` 接口（`name` / `level` / `analyze`），并在 `main.ts` 的 `initEngines` 中注册到 `EngineDispatcher` 即可接入调度与降级链。

## 兼容性

- Obsidian v1.4.0 及以上
- Windows / macOS / Linux
- 层级三需要本地安装并运行 Ollama（`ollama pull qwen2.5:7b` 后 `ollama serve`）

## 许可

MIT

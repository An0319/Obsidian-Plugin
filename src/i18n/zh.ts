/** 中文文案字典（源语言，缺 key 时英文回退到此） */
export const zh = {
  // 通用
  "common.save": "保存",
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.undo": "撤销",
  "common.retry": "重试",

  // 设置分页
  "tab.quickstart": "快速开始",
  "tab.rulesFolders": "规则与文件夹",
  "tab.intelligence": "智能与模型",
  "tab.general": "通用",

  // 快速开始
  "quick.title": "快速入门",
  "quick.intro":
    "把笔记放进 Inbox，插件判断归属并自动移动（也可只提醒、文件不动），全程本地完成。按下面三步跑通第一次使用：",
  "quick.step1Title": "第 1 步 · 选好语言",
  "quick.step1Desc":
    "在这里改语言：「通用」分页 → 界面语言，可选 自动（跟随 Obsidian）/ 中文 / English。",
  "quick.step2Title": "第 2 步 · 跑第一次整理",
  "quick.step2Desc":
    "「通用」分页确认 Inbox 文件夹名 → 把几篇待归档笔记放进去 → Ctrl+P 输入「立即整理 Inbox」回车 → 弹出整理报告单：每篇搬去了哪、依据是什么、把握多大；不满意点「撤销」送回原位。",
  "quick.step3Title": "第 3 步 · 教它你的规矩",
  "quick.stepsTitle": "三步上手",
  "quick.step3Desc":
    "「规则与文件夹」分页：在「从已有文件夹开始」点任意文件夹的「建规则」一键生成草稿；或点「导入种子规则」拿一套日期、会议、模板等现成规则；也可「新建规则」从零写。",
  "quick.mapTitle": "什么需求，用什么功能",
  "quick.map1Need": "攒了一批笔记没归档，想一口气清完",
  "quick.map1How": "Ctrl+P →「立即整理 Inbox」批量整理；报告单支持逐篇或整批撤销，放心跑。",
  "quick.map2Need": "记笔记时文件自己乱跳，打断思路",
  "quick.map2How": "「通用」分页 → 实时归档 → 改为「只提醒」：只给建议，文件原地不动。",
  "quick.map3Need": "某类笔记永远该进某个文件夹",
  "quick.map3How": "「规则与文件夹」分页 → 新建规则：标题或路径包含关键词就自动归位；列表顺序即优先级。",
  "quick.map4Need": "笔记没有明显关键词，也想归对位置",
  "quick.map4How": "「智能引擎」分页 → 引擎层级改选 TF-IDF 相似度：按笔记内容与各文件夹已有笔记的相似程度判断。",
  "quick.map5Need": "想接本地大模型做更强的判断",
  "quick.map5How": "「智能引擎」分页 → 填好 Ollama 地址与模型名，引擎层级选本地大模型；连不上会自动降级回上一层。",
  "quick.map6Need": "想知道插件最近动了哪些文件",
  "quick.map6How": "「通用」分页 → 打开「记录整理日志」，页面底部就是最近 200 次整理记录，可一键清空。",
  "quick.pagesTitle": "四个分页各管什么",
  "quick.pages1Name": "快速开始",
  "quick.pages1Desc": "本页：上手步骤、场景速查与引擎层级总开关。",
  "quick.pages2Name": "规则与文件夹",
  "quick.pages2Desc": "规则的增删改、种子规则、从文件夹树建规则、custom_rules.json 样例下载。",
  "quick.pages3Name": "智能引擎",
  "quick.pages3Desc": "TF-IDF 阈值、Ollama 连接与测试、社区共享配置导入导出。",
  "quick.pages4Name": "通用",
  "quick.pages4Desc": "界面语言、实时归档三档、Inbox 与排除设置、整理日志。",
  "quick.hintNoSeed":
    "尚未导入内置规则集——在「规则与文件夹」分页点击「导入种子规则」即可开始。",

  // 引擎
  "engine.title": "整理引擎",
  "engine.level": "当前引擎层级",
  "engine.levelDesc":
    "层级一零门槛开箱即用；层级二无需 AI 模型；层级三需本地 Ollama；层级四零计算享受共享智慧",
  "engine.l1": "层级一：规则映射",
  "engine.l2": "层级二：TF-IDF 智能匹配",
  "engine.l3": "层级三：本地大模型（Ollama）",
  "engine.l4": "层级四：社区共享配置",

  // 规则列表
  "rules.title": "层级一：规则映射",
  "rules.desc":
    "规则按顺序逐条匹配，命中即移动。目标文件夹输入框支持从库内已有文件夹中选择。",
  "rules.new": "新建规则",
  "rules.editTitleNew": "新建规则",
  "rules.editTitleEdit": "编辑规则",
  "rules.name": "规则名称",
  "rules.nameEmpty": "规则名称不能为空",
  "rules.field": "匹配字段",
  "rules.field.title": "标题",
  "rules.field.content": "笔记内容",
  "rules.field.tag": "标签",
  "rules.field.filename": "文件名 / 路径",
  "rules.field.mtime": "修改时间",
  "rules.operator": "匹配方式",
  "rules.op.contains": "含有某些文字（推荐）",
  "rules.op.equals": "完全等于",
  "rules.op.regex": "按固定规律匹配（正则，进阶）",
  "rules.op.olderThanDays": "超过 N 天未修改",
  "rules.op.always": "所有笔记都适用（兜底）",
  "rules.pattern": "匹配模式",
  "rules.pattern.days": "填写天数，如：30 表示超过 30 天未修改",
  "rules.pattern.always": "兜底规则无需填写",
  "rules.pattern.regex":
    "进阶写法：用符号描述文字规律，如 ^日记 表示以「日记」开头。日常需求选「含有某些文字」就够了",
  "rules.pattern.default": "填写笔记中要找的文字，如：投资",
  "rules.pattern.placeholder.days": "30",
  "rules.pattern.placeholder.regex": "如：^日记",
  "rules.pattern.placeholder.default": "如：投资",
  "rules.patternEmpty": "匹配模式不能为空",
  "rules.target": "目标文件夹",
  "rules.targetDesc": "从库内已有文件夹选择，或直接输入新路径（首次移动时自动创建）",
  "rules.targetPlaceholder": "如：02-战略/竞品",
  "rules.weight": "权重（可选）",
  "rules.weightDesc": "0~1，影响命中时的置信度；留空或 1 表示默认置信度",
  "rules.weightPlaceholder": "如：0.9",
  "rules.editTip": "编辑",
  "rules.deleteTip": "删除",
  "rules.upTip": "上移（提高优先级）",
  "rules.downTip": "下移（降低优先级）",

  // 种子规则
  "seed.label": "内置规则集",
  "seed.desc":
    "一键导入默认规则（日志归位 / 归档陈旧笔记 / 收件箱兜底）；已有同名规则会跳过，目标文件夹自动复用你库内已有的同名或等价文件夹",
  "seed.button": "导入种子规则",
  "seed.alreadyImported": "种子规则已存在，无需重复导入",
  "seed.imported": "已导入 {n} 条种子规则：\n{detail}",

  // 从已有文件夹开始
  "folders.title": "从已有文件夹开始",
  "folders.desc":
    "库里已经分好类的文件夹可以直接利用：点「建规则」会打开规则编辑器，目标文件夹和匹配内容已帮你填好，改一下就能保存使用。",
  "folders.empty": "还没有可用的文件夹——先在库里建一个分类文件夹，或用内置规则开始。",
  "folders.buildRule": "建规则",
  "folders.pathNotes": "路径 {path} · {n} 篇笔记",
  "folders.coldStart": "还没有笔记——建规则后，笔记进入时插件会自动学习",
  "folders.overflow": "共 {n} 个文件夹，仅展示前 {shown} 个——其余可在规则编辑器的目标文件夹输入框中直接选择。",
  "folders.ruleAdded": "规则「{name}」已添加",

  // custom_rules.json
  "customRules.label": "custom_rules.json",
  "customRules.desc":
    "在库的最外层放一个名为 custom_rules.json 的规则文件，点「从库根导入」即可批量添加规则。没有该文件可先点「生成样例文件」获得一份可直接修改的示例。",
  "customRules.sample": "生成样例文件",
  "customRules.sampleDone":
    "已在库的最外层创建 custom_rules.json 示例文件：打开修改后，点「从库根导入」即可体验",
  "customRules.sampleFail": "创建失败：{msg}",
  "customRules.confirmOverwriteTitle": "覆盖确认",
  "customRules.confirmOverwrite":
    "库的最外层已有 custom_rules.json，生成样例会覆盖现有内容，确定继续吗？",
  "customRules.overwrite": "覆盖",
  "customRules.import": "从库根导入",
  "customRules.notFound": "未找到 custom_rules.json——可点「生成样例文件」快速创建",
  "customRules.readFail": "读取失败：{msg}",
  "customRules.importedFrom": "已从 {desc} 导入 {n} 条规则",
  "customRules.importedPartial": "导入 {n} 条，跳过 {m} 条已存在（id 重复）",

  // 层级二
  "tfidf.title": "层级二：TF-IDF 智能匹配",
  "tfidf.desc":
    "从你已有文件夹的内容中学习特征向量：某文件夹笔记越多，相似的新笔记越容易被归入其中。无需配置即可跟随你的目录结构。",
  "tfidf.threshold": "相似度阈值",
  "tfidf.thresholdDesc": "当前 {pct}%，低于该值时建议保留原位",
  "tfidf.maxNotes": "参与计算的笔记上限",
  "tfidf.maxNotesDesc": "每文件夹按最新优先截取，避免大库卡顿",
  "tfidf.rebuild": "重建特征缓存",
  "tfidf.rebuildDesc": "文件夹内容变更会自动重算，也可手动触发",
  "tfidf.rebuildButton": "重建",
  "tfidf.rebuildDone": "文件夹特征已重建",

  // 层级三
  "ollama.title": "层级三：本地大模型（Ollama）",
  "ollama.address": "Ollama 地址",
  "ollama.model": "模型名称",
  "ollama.modelDesc": "默认 qwen2.5:7b，需已通过 ollama pull 下载",
  "ollama.timeout": "请求超时（毫秒）",
  "ollama.fallback": "失败自动降级",
  "ollama.fallbackDesc": "Ollama 未运行或超时时自动降级到层级二 / 层级一",
  "ollama.test": "连接测试",
  "ollama.testButton": "测试",
  "ollama.testOk": "Ollama 连接成功（{model}）",
  "ollama.testFail": "无法连接 Ollama，请确认服务已启动（ollama serve）",

  // 层级四
  "shared.title": "层级四：社区共享配置",
  "shared.loaded": "已加载：{name}",
  "shared.notLoaded": "未加载配置",
  "shared.status": "配置状态",
  "shared.importSample": "导入示例配置",
  "shared.importSampleDone": "示例配置已导入",
  "shared.importFile": "导入配置文件",
  "shared.importFileDesc": "选择社区分享的 JSON 配置文件",
  "shared.chooseFile": "选择文件",
  "shared.imported": "已导入配置「{name}」",
  "shared.importFail": "导入失败：{msg}",
  "shared.export": "导出当前配置",
  "shared.exportDesc": "导出规则 + 预计算文件夹向量，可分享到社区（建议层级二缓存重建后导出）",
  "shared.exportButton": "导出 JSON",
  "shared.exported": "配置已导出下载",
  "shared.exportFail": "导出失败：{msg}",

  // 通用设置
  "general.title": "通用设置",
  "general.desc": "实时归档、收件箱、排除范围、界面语言与日志开关。",
  "general.autoMode": "实时归档",
  "general.autoModeDesc": "监听 Inbox 新笔记并按建议处理；「只提醒」模式下文件保持原位",
  "general.auto.off": "关闭",
  "general.auto.notify": "只提醒（文件不动）",
  "general.auto.move": "直接归档（静默移动）",
  "general.inbox": "Inbox 文件夹名",
  "general.inboxDesc": "自动整理只处理该文件夹内的新笔记；留空则处理全库",
  "general.unclassified": "未归类文件夹",
  "general.unclassifiedDesc": "所有引擎均无建议时的兜底目标；留空则保留原位",
  "general.excluded": "排除文件夹",
  "general.excludedDesc": "逗号分隔，这些文件夹及其子目录不参与整理与特征计算",
  "general.locale": "界面语言",
  "general.localeDesc": "设置面板、通知与命令的语言",
  "general.locale.auto": "跟随系统",
  "general.locale.zh": "中文",
  "general.locale.en": "English",
  "general.reset": "恢复默认设置",
  "general.resetButton": "重置",
  "general.resetDone": "已恢复默认设置",
  "general.enableLog": "记录整理日志",
  "general.enableLogDesc": "保存最近 200 次移动记录到插件目录（organize-log.json），便于追溯",

  // 整理记录
  "log.title": "最近整理记录",
  "log.desc":
    "仅保留最近 200 条移动记录（organize-log.json，存于插件目录），超出自动丢弃最旧的。数据完全本地保存，可随时清空。",
  "log.clear": "清空整理记录",
  "log.clearDesc": "删除全部历史记录，此操作不可恢复",
  "log.clearButton": "清空",
  "log.cleared": "整理记录已清空",
  "log.empty": "暂无记录",

  // 整理报告
  "report.title": "整理报告",
  "report.moved": "已移动 {n} 篇",
  "report.kept": "保留原位 {n} 篇",
  "report.keptEmpty": "全部笔记都已归位",
  "report.undo": "撤销",
  "report.undoAll": "全部撤销",
  "report.undone": "已撤销",
  "report.undoConfirmTitle": "撤销确认",
  "report.undoConfirm": "将把本次整理移动的 {n} 篇笔记全部移回原位，确定继续吗？",
  "report.undoDone": "已移回原位",
  "report.undoDoneAll": "已撤销 {n} 篇移动",
  "report.undoFail": "撤销 {n} 篇成功，{m} 篇失败",
  "report.fileGone": "文件已不在预期位置，请手动处理",
  "report.to": "→",
  "report.keptReason": "保留原因",

  // 通知
  "notify.autoMoved": "已将「{name}」移至 {to}（{reason}）",
  "notify.autoSuggest": "「{name}」建议移至 {to}（{reason}）——可在设置中开启直接归档",
  "notify.noSuggestion": "所有引擎均无法给出建议，请检查引擎配置",
  "notify.keepInPlace": "暂无合适建议：{reason}",
  "preview.keepInPlace": "（建议保留原位）",
  "notify.movedTo": "已移动「{name}」到 {to}",
  "notify.analyzeFail": "分析失败：{msg}",
  "notify.suggestTo": "「{name}」建议 → {to}\n{reason}{degraded}",
  "notify.degraded": "\n（层级{from}不可用，已降级到层级{to}）",
  "notify.inboxDone":
    "整理完成：移动 {moved} 篇，跳过 {skipped} 篇{errors}",
  "notify.inboxErrors": "，失败 {n} 篇（详见整理报告）",
  "notify.inboxStart": "开始整理…",
  "notify.inboxProgress": "整理中 {done}/{total}：{name}",

  // 命令
  "cmd.organizeCurrent": "整理当前笔记",
  "cmd.previewSuggestion": "预览当前笔记的整理建议",
  "cmd.organizeInbox": "立即整理 Inbox",
  "cmd.rebuildCache": "重建层级二特征缓存",
} as const;

export type I18nKey = keyof typeof zh;

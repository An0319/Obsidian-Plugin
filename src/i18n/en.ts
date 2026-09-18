import { I18nKey, zh } from "./zh";

/** English dictionary. Missing keys fall back to Chinese. */
export const en: Partial<Record<I18nKey, string>> = {
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.undo": "Undo",
  "common.retry": "Retry",

  "tab.quickstart": "Quick Start",
  "tab.rulesFolders": "Rules & Folders",
  "tab.intelligence": "Intelligence",
  "tab.general": "General",

  "quick.title": "Quick Start",
  "quick.flow":
    "How it works: drop notes into Inbox → click the ribbon icon (or rely on auto mode) → the plugin decides where each note belongs and moves it, updating all internal links. Fully local; unmatched notes stay where they are.",
  "quick.steps":
    "Three steps to start: 1) Confirm the Inbox folder name below; 2) Create organizing rules — start from existing folders, import the built-in rule set, or create one from scratch; 3) Try it on one note via the ribbon icon.",
  "quick.hintNoSeed":
    "The built-in rule set has not been imported — open the \"Rules & Folders\" tab and click \"Import seed rules\".",

  "engine.title": "Organizing Engine",
  "engine.level": "Active engine level",
  "engine.levelDesc":
    "Level 1 works out of the box; Level 2 needs no AI model; Level 3 requires a local Ollama; Level 4 imports community configurations with zero compute.",
  "engine.l1": "Level 1: Rule Mapping",
  "engine.l2": "Level 2: TF-IDF Matching",
  "engine.l3": "Level 3: Local LLM (Ollama)",
  "engine.l4": "Level 4: Community Shared Config",

  "rules.title": "Level 1: Rule Mapping",
  "rules.desc":
    "Rules are evaluated top to bottom; the first hit moves the note. The target folder input suggests existing vault folders.",
  "rules.new": "New Rule",
  "rules.editTitleNew": "New Rule",
  "rules.editTitleEdit": "Edit Rule",
  "rules.name": "Rule name",
  "rules.nameEmpty": "Rule name is required",
  "rules.field": "Match field",
  "rules.field.title": "Title",
  "rules.field.content": "Content",
  "rules.field.tag": "Tag",
  "rules.field.filename": "Filename / Path",
  "rules.field.mtime": "Modified time",
  "rules.operator": "Match method",
  "rules.op.contains": "Contains text (recommended)",
  "rules.op.equals": "Equals exactly",
  "rules.op.regex": "Pattern match (regex, advanced)",
  "rules.op.olderThanDays": "Untouched for over N days",
  "rules.op.always": "All notes (fallback)",
  "rules.pattern": "Match pattern",
  "rules.pattern.days": "Enter days, e.g. 30 means untouched for over 30 days",
  "rules.pattern.always": "Fallback rules need no pattern",
  "rules.pattern.regex":
    "Advanced: describe a text pattern with symbols, e.g. ^Journal matches filenames starting with \"Journal\". Use \"Contains text\" for everyday needs.",
  "rules.pattern.default": "Text to look for in the note, e.g. investing",
  "rules.pattern.placeholder.days": "30",
  "rules.pattern.placeholder.regex": "e.g. ^Journal",
  "rules.pattern.placeholder.default": "e.g. investing",
  "rules.patternEmpty": "Match pattern is required",
  "rules.target": "Target folder",
  "rules.targetDesc":
    "Pick an existing vault folder, or type a new path (created on first move)",
  "rules.targetPlaceholder": "e.g. Projects/Research",
  "rules.weight": "Weight (optional)",
  "rules.weightDesc": "0~1, affects hit confidence; leave empty or 1 for default",
  "rules.weightPlaceholder": "e.g. 0.9",
  "rules.editTip": "Edit",
  "rules.deleteTip": "Delete",
  "rules.upTip": "Move up (higher priority)",
  "rules.downTip": "Move down (lower priority)",

  "seed.label": "Built-in rule set",
  "seed.desc":
    "Import the default rules in one click (journal filing / archive stale notes / inbox fallback). Existing rules are skipped; target folders reuse matching folders already in your vault.",
  "seed.button": "Import seed rules",
  "seed.alreadyImported": "Seed rules already imported",
  "seed.imported": "Imported {n} seed rules:\n{detail}",

  "folders.title": "Start from Existing Folders",
  "folders.desc":
    "Folders you already organized can power rules directly: click \"Create rule\" and the editor opens with the target folder and pattern pre-filled — tweak and save.",
  "folders.empty":
    "No usable folders yet — create a folder in your vault, or start with the built-in rules.",
  "folders.buildRule": "Create rule",
  "folders.pathNotes": "Path {path} · {n} notes",
  "folders.coldStart":
    "No notes yet — once a rule exists, the plugin learns as notes arrive",
  "folders.overflow":
    "{n} folders in total, showing the first {shown} — the rest can be picked in the rule editor's target folder input.",
  "folders.ruleAdded": "Rule \"{name}\" added",

  "customRules.label": "custom_rules.json",
  "customRules.desc":
    "Place a file named custom_rules.json at the vault root and click \"Import from vault root\" to add rules in bulk. Use \"Create sample file\" first if you don't have one.",
  "customRules.sample": "Create sample file",
  "customRules.sampleDone":
    "Sample custom_rules.json created at the vault root: edit it, then click \"Import from vault root\"",
  "customRules.sampleFail": "Failed to create: {msg}",
  "customRules.confirmOverwriteTitle": "Overwrite confirmation",
  "customRules.confirmOverwrite":
    "custom_rules.json already exists at the vault root. Creating the sample will overwrite it. Continue?",
  "customRules.overwrite": "Overwrite",
  "customRules.import": "Import from vault root",
  "customRules.notFound":
    "custom_rules.json not found — click \"Create sample file\" to get started",
  "customRules.readFail": "Failed to read: {msg}",
  "customRules.importedFrom": "Imported {n} rules from {desc}",
  "customRules.importedPartial": "Imported {n}, skipped {m} already existing (duplicate id)",

  "tfidf.title": "Level 2: TF-IDF Matching",
  "tfidf.desc":
    "Learns feature vectors from the content of your existing folders: the more notes a folder has, the more likely similar new notes land there. Follows your structure with zero configuration.",
  "tfidf.threshold": "Similarity threshold",
  "tfidf.thresholdDesc": "Currently {pct}% — below it, notes stay in place",
  "tfidf.maxNotes": "Notes per folder",
  "tfidf.maxNotesDesc": "Each folder uses its newest notes first to avoid slowdowns on large vaults",
  "tfidf.rebuild": "Rebuild feature cache",
  "tfidf.rebuildDesc": "Recalculated automatically as folders change; manual trigger available",
  "tfidf.rebuildButton": "Rebuild",
  "tfidf.rebuildDone": "Folder features rebuilt",

  "ollama.title": "Level 3: Local LLM (Ollama)",
  "ollama.address": "Ollama address",
  "ollama.model": "Model name",
  "ollama.modelDesc": "Default qwen2.5:7b, downloaded via ollama pull",
  "ollama.timeout": "Request timeout (ms)",
  "ollama.fallback": "Auto-fallback on failure",
  "ollama.fallbackDesc":
    "Falls back to Level 2 / Level 1 when Ollama is not running or times out",
  "ollama.test": "Connection test",
  "ollama.testButton": "Test",
  "ollama.testOk": "Ollama connected ({model})",
  "ollama.testFail": "Cannot reach Ollama — make sure the service is running (ollama serve)",

  "shared.title": "Level 4: Community Shared Config",
  "shared.loaded": "Loaded: {name}",
  "shared.notLoaded": "No configuration loaded",
  "shared.status": "Config status",
  "shared.importSample": "Import sample config",
  "shared.importSampleDone": "Sample config imported",
  "shared.importFile": "Import config file",
  "shared.importFileDesc": "Pick a JSON config shared by the community",
  "shared.chooseFile": "Choose file",
  "shared.imported": "Imported config \"{name}\"",
  "shared.importFail": "Import failed: {msg}",
  "shared.export": "Export current config",
  "shared.exportDesc":
    "Exports rules + precomputed folder vectors for sharing (rebuild the Level 2 cache first)",
  "shared.exportButton": "Export JSON",
  "shared.exported": "Config exported and downloaded",
  "shared.exportFail": "Export failed: {msg}",

  "general.title": "General",
  "general.desc": "Real-time filing, inbox, exclusions, interface language and logs.",
  "general.autoMode": "Real-time filing",
  "general.autoModeDesc":
    "Watch new Inbox notes and act on suggestions; in \"Notify\" mode files stay in place",
  "general.auto.off": "Off",
  "general.auto.notify": "Notify only (no file moves)",
  "general.auto.move": "File directly (silent moves)",
  "general.inbox": "Inbox folder name",
  "general.inboxDesc":
    "Auto filing only watches new notes inside this folder; leave empty to watch the whole vault",
  "general.unclassified": "Unclassified folder",
  "general.unclassifiedDesc":
    "Fallback target when no engine has a suggestion; leave empty to keep notes in place",
  "general.excluded": "Excluded folders",
  "general.excludedDesc":
    "Comma-separated; these folders and their children are never touched",
  "general.locale": "Interface language",
  "general.localeDesc": "Language for the settings panel, notices and commands",
  "general.locale.auto": "System",
  "general.locale.zh": "中文",
  "general.locale.en": "English",
  "general.reset": "Reset settings",
  "general.resetButton": "Reset",
  "general.resetDone": "Settings restored to defaults",
  "general.enableLog": "Keep organizing log",
  "general.enableLogDesc":
    "Stores the last 200 moves in the plugin folder (organize-log.json) for traceability",

  "log.title": "Recent Activity",
  "log.desc":
    "Keeps the last 200 moves only (organize-log.json in the plugin folder); older entries are dropped. Fully local, clear anytime.",
  "log.clear": "Clear organizing log",
  "log.clearDesc": "Deletes all history. This cannot be undone",
  "log.clearButton": "Clear",
  "log.cleared": "Organizing log cleared",
  "log.empty": "No entries yet",

  "report.title": "Organizing Report",
  "report.moved": "{n} moved",
  "report.kept": "{n} kept in place",
  "report.keptEmpty": "Every note has been filed",
  "report.undo": "Undo",
  "report.undoAll": "Undo all",
  "report.undone": "Undone",
  "report.undoConfirmTitle": "Undo confirmation",
  "report.undoConfirm":
    "This will move all {n} notes handled in this run back to their original locations. Continue?",
  "report.undoDone": "Moved back",
  "report.undoDoneAll": "{n} moves undone",
  "report.undoFail": "{n} undone, {m} failed",
  "report.fileGone": "File is no longer at the expected location — please handle manually",
  "report.to": "→",
  "report.keptReason": "Reason",

  "notify.autoMoved": "Moved \"{name}\" to {to} ({reason})",
  "notify.autoSuggest":
    "\"{name}\" should move to {to} ({reason}) — enable direct filing in settings",
  "notify.noSuggestion": "No engine produced a suggestion — check engine settings",
  "notify.keepInPlace": "No suitable suggestion: {reason}",
  "preview.keepInPlace": "(suggested to stay in place)",
  "notify.movedTo": "Moved \"{name}\" to {to}",
  "notify.analyzeFail": "Analysis failed: {msg}",
  "notify.suggestTo": "\"{name}\" → {to}\n{reason}{degraded}",
  "notify.degraded": "\n(Level {from} unavailable, fell back to Level {to})",
  "notify.inboxDone": "Done: {moved} moved, {skipped} skipped{errors}",
  "notify.inboxErrors": ", {n} failed (see the organizing report)",
  "notify.inboxStart": "Organizing…",
  "notify.inboxProgress": "Organizing {done}/{total}: {name}",

  "cmd.organizeCurrent": "Organize current note",
  "cmd.previewSuggestion": "Preview suggestion for current note",
  "cmd.organizeInbox": "Organize Inbox now",
  "cmd.rebuildCache": "Rebuild Level 2 feature cache",
};

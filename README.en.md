# Smart Notes Organizer — Local Semantic Bookmark for Obsidian

English | [中文](./README.md)

Drop files into your Inbox, hit run, and the plugin moves each note to the folder it is semantically closest to in your vault.

**In one line: smart archiving that needs no network, no waiting, and never goes offline.**

**Core philosophy: Behavior as Rule** — zero configuration; the plugin learns from how you have been organizing files all along.

## Features

- Watches your Inbox folder, analyzes where new and unorganized notes belong, and moves them automatically (fully automatic by default)
- Moves files via `app.fileManager.renameFile`, so Obsidian updates every internal link (`[[reference]]`) automatically
- Creates missing folders on the fly
- Keeps a log of the last 200 organize operations in the plugin directory (`organize-log.json`); the full decision tree is visible in the console (`Ctrl+Shift+I`)
- All data is processed locally; nothing is ever uploaded to any external service

## Design Boundaries

**In scope for V1.0:**

- Plain-text Markdown organizing
- Four-level fallback chain (Rule Mapping → TF-IDF → Ollama → Community Shared Config)
- Chinese + English content
- Fully local, zero API cost, zero data upload

**Explicitly excluded forever:**

- Audio transcription, OCR, image recognition, PDF parsing
- Chat, RAG, vector databases
- Any form of cloud dependency

> This plugin will never process audio, images, PDFs, or chats. Use other open-source tools (e.g., WhisperDesktop, Tesseract) to convert them to Markdown first, then let this plugin organize the results.

Clear boundaries are professionalism: smaller modules are more reliable; focused capabilities are more trustworthy.

## Four-Level Engine

| Level | Name | Audience | How it works |
|-------|------|----------|--------------|
| 1 | Rule Mapping | Every device, zero setup | Keyword/tag/path rules matched in priority order |
| 2 | TF-IDF Matching | Any computer, no AI model required | Hand-written TF-IDF + cosine similarity against folder feature vectors |
| 3 | Local LLM | High-end devices with [Ollama](https://ollama.com) | Calls local Ollama (default `qwen2.5:7b`) for semantic classification |
| 4 | Community Shared Config | Low-end devices, zero computation | Import rule-sets + precomputed folder vectors from others |

Fallback: when Level 3 fails (Ollama not running / timeout), the chain degrades to Level 2, then to Level 1.

## Core Philosophy: Behavior as Rule

How zero-configuration intelligence works:

1. **Seed Rule-set**: V1.0 ships with only three minimal default rules:
   - `/Journal` — file names containing a date pattern
   - `/Archive` — untouched for over 30 days
   - `/Inbox` — default fallback

   No "deep learning / legal / medical" semantic categories are built in — those belong in the user's `custom_rules.json`.

2. **Behavior learning**: after you manually drag a batch of notes into a folder, the plugin computes that folder's feature vector. Similar content arriving later gets moved in automatically once cosine similarity exceeds the threshold. Dragging is labeling; behavior is the rule.

3. **The only "intelligence" is TF-IDF similarity** — pure local math, millisecond latency, no model required.

## Getting Started

1. Build the plugin (see "Development" below), then copy `main.js`, `manifest.json`, `styles.css` into
   `<your vault>/.obsidian/plugins/obsidian-smart-notes/`
2. Enable "Smart Notes Organizer" in Settings → Community plugins
3. Level 1 (rule mapping) is enabled by default with the seed rule-set — works out of the box

A ribbon icon in the sidebar runs the organizer on click.

### Commands

| Command | Description |
|---------|-------------|
| Organize current note | Analyzes the current file and moves it per your settings |
| Preview suggestion for current note | Shows the suggestion and its reasoning only |
| Organize Inbox now | Batch-organizes every note in the Inbox, with progress feedback |
| Rebuild Level-2 feature cache | Manually refreshes folder feature vectors |

### Settings

- **Engine selection**: Level 1 / 2 / 3 / 4
- **Level 1**: add, edit and reorder rules (order = priority), one-click seed rule-set import
- **Level 2**: similarity threshold (0.1–0.9, default 0.3), note cap for computation, manual cache rebuild
- **Level 3**: Ollama URL (default `http://localhost:11434`), model name (default `qwen2.5:7b`), timeout, connection test, auto-fallback on failure
- **Level 4**: import JSON config file / export current config for sharing
- **General**: auto-organize toggle, Inbox folder name, fallback folder, excluded folders, logging

## Rule Syntax (Level 1 / Level 4)

Each rule has:

- **Match field**: title / note content / tags / file name
- **Match mode**: contains / equals / regex (case-insensitive)
- **Target folder**: path relative to the vault root, e.g. `02-Strategy/Competitors`
- **Weight** (optional, carried by shared configs): used as hit confidence

Examples (user-defined via `custom_rules.json`):

- File name matches `^\d{4}-\d{2}-\d{2}$` → move to `Journal`
- Content contains `invest` → move to `Investment`
- Tag equals `todo` → move to `Todo`

## Shared Config (Level 4)

A JSON file containing the rule list, precomputed folder TF-IDF vectors, the global IDF table, and the similarity threshold. Advanced users can export their config and share it with the community; low-end users import it and get near-AI classification with zero computation.

Community-contributed rule-sets live in the repo's `/rules` directory (a one-way rule marketplace — see "Community & Contributing" below).

## Language Support

| Version | Language support |
|---------|------------------|
| V1.0 | Chinese (Bigram tokenization) + English (whitespace tokenization) |
| V2.0 - V3.0 | Ongoing optimization of mixed Chinese-English content |
| V4.0 - V5.0 | Korean (Beta, experimental; requires loading an extra dictionary) |

Note: Korean is an agglutinative language with complex morphology; V1.0 makes no Korean promises.

## Community & Contributing

- No forum, no Discord
- Feedback via GitHub Issues only; rule contributions via PR
- The repo's `/rules` directory hosts community-contributed `ruleset.json` files
- The community is a one-way rule marketplace, not a chat room

## Why This Plugin

1. **Zero marginal cost**: TF-IDF is pure local math — no API fees
2. **Privacy red line**: your notes never leave your machine
3. **Fallback-chain resilience**: rules + TF-IDF keep working offline
4. **Explainable + controllable**: reason output + full decision tree in the console
5. **Chinese-native**: Bigram tokenization + Chinese documentation

Competitive strategy: we don't compete with cloud AI on the intelligence ceiling; we compete on "free + privacy + a high floor of usability."

## Development

Stack: TypeScript + esbuild (official Obsidian template pattern); Level 2 is a hand-written algorithm with zero runtime dependencies; Level 3 uses Obsidian's native `requestUrl`; tests use Vitest.

```bash
# Install dependencies
npm install

# Dev mode (watch mode, outputs main.js)
npm run dev

# Type check + production build (minified main.js)
npm run build

# Run unit tests
npm test
```

### Project Layout

```
├── manifest.json              # Plugin manifest
├── esbuild.config.mjs         # Build config
├── main.js                    # Build output
├── src/
│   ├── main.ts                # Entry: event listeners, command registration, engine assembly
│   ├── types.ts               # Core types: IOrganizeEngine, rules, suggestions, shared config
│   ├── engines/
│   │   ├── ruleEngine.ts      # Level 1: rule mapping
│   │   ├── tfidf/
│   │   │   ├── tokenizer.ts   #   Tokenizer (Chinese bigrams + English words)
│   │   │   ├── tfidf.ts       #   TF-IDF / cosine similarity
│   │   │   └── tfidfEngine.ts # Level 2: smart matching (TTL + signature dual cache)
│   │   ├── ollamaEngine.ts    # Level 3: local LLM
│   │   └── sharedModelEngine.ts # Level 4: community shared config
│   ├── scheduler/
│   │   ├── dispatcher.ts      # Engine dispatch and fallback chain
│   │   └── organizerService.ts # Core service: analyze, apply suggestions, batch organize
│   ├── services/
│   │   └── fileOrganizer.ts   # Folder creation, moving, link updates, logging
│   ├── settings/
│   │   ├── settings.ts        # Settings data structure and defaults
│   │   └── settingsTab.ts     # Settings panel UI
│   └── utils/
│       └── helpers.ts         # Rule matching, path normalization, utilities
└── tests/                     # Vitest unit tests (56 cases)
```

### Adding a New Engine

Implement the `IOrganizeEngine` interface (`name` / `level` / `analyze`) and register it with the `EngineDispatcher` in `initEngines` inside `main.ts` to join the scheduling and fallback chain.

## Compatibility

- Obsidian v1.4.0 and above
- Windows / macOS / Linux
- Level 3 requires a local Ollama installation (`ollama pull qwen2.5:7b`, then `ollama serve`)

## License

MIT

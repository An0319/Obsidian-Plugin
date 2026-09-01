# GitHub Actions 发布工作流行动方案

状态：方案已确认，待实施。

## 第 1 步：补齐版本管理文件

Obsidian 官方发布要求三处版本一致：`package.json`、`manifest.json`、`versions.json`（新建）：

```json
{
  "0.1.0": "1.4.0"
}
```

## 第 2 步：创建 `.github/workflows/deploy.yml`

```yaml
name: Release Obsidian Plugin

on:
  push:
    tags:
      - "*"

env:
  PLUGIN_NAME: obsidian-smart-notes

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - run: npm ci

      # 校验 tag 与 manifest.json 版本一致，防止发错版本
      - name: Verify tag matches manifest version
        run: |
          VERSION=$(node -p "require('./manifest.json').version")
          if [ "refs/tags/$VERSION" != "${{ github.ref }}" ]; then
            echo "tag ${{ github.ref_name }} 与 manifest 版本 $VERSION 不一致"
            exit 1
          fi

      - run: npm run build

      - name: Create Release and Upload Assets
        uses: softprops/action-gh-release@v2
        with:
          files: |
            main.js
            manifest.json
          generate_release_notes: true
```

## 第 3 步：补充 PR/CI 校验工作流（可选）

创建 `.github/workflows/ci.yml`，在每次 push 和 PR 时跑 `npm run build` + `npm test`。

## 第 4 步：日常发布流程

```bash
# 1. 更新三处版本号（manifest.json、package.json、versions.json）
# 2. 提交版本变更
git add manifest.json package.json versions.json
git commit -m "chore: release v0.1.0"

# 3. 打 tag（必须与 manifest.json 的 version 完全一致）
git tag 0.1.0

# 4. 推送
git push && git push --tags
# Actions 自动构建 → GitHub Release 出现 main.js + manifest.json
```

## 第 5 步：分发渠道

| 渠道 | 说明 |
|------|------|
| 手动安装 | 用户从 Release 下载 main.js + manifest.json 放入插件目录 |
| BRAT | 用户通过 BRAT 插件直接安装仓库地址，无需审核 |
| 官方市场 | 向 obsidianmd/obsidian-releases 提 PR 提交审核 |

## 注意事项

- main.js 已在 .gitignore 中，由 CI 构建生成并上传 Release，仓库保持干净
- tag 用裸版本号（如 0.1.0），官方审核要求 tag 与 manifest version 完全一致
- 无需额外配置 secrets，GITHUB_TOKEN 由 Actions 自动注入

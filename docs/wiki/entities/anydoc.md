---
title: anydoc（文件格式转换，非 markdown 材料唯一入口）
type: entity
tags: [anydoc, 格式转换, markdown, OCR]
created: 2026-09-18
updated: 2026-09-18
sources: []
status: active
---

# anydoc（文件格式转换，非 markdown 材料唯一入口）

## 职责

知识库**目标文档类型为 markdown**（决策见 [llm-wiki 目标文档类型 markdown 与 anydoc 转换](../decisions/llm-wiki-markdown-anydoc.md)）；用户喂入的任何非 markdown 材料一律先用 anydoc 转成 GitHub-Flavored Markdown 再沉淀。规则文件（`rules/AGENTS.md` 12.5）只保留关键用法，本页承载全部细节。

## 支持格式（17 种）

doc / docx / docm、ppt / pptx / pptm / pps、xls / xlsx / xlsm / xlsb / ods / odt、rtf、epub、csv、pdf。

格式按文件内容自动识别，仅识别不了时才传 `--format`（stdin 必须显式 `--format`，如 `anydoc - --format csv < 数据.csv`）。

## 用法（版本固定 0.2.4，防止上游更新改变 CLI 行为）

```bash
# 本地已装（当前项目 node_modules 存在时优先，如本仓库）
node_modules/.bin/anydoc <文件> -o 输出.md
# 否则用全局 anydoc（安装器装规则时已自动装固定版本）
anydoc <文件> -o 输出.md
# 两者都缺失（未跑过安装器）
npx -y @firecrawl/anydoc@0.2.4 <文件> -o 输出.md
```

- npx 首次自动拉取并本地缓存；不加 `-o` 时 markdown 输出到 stdout，大文档写文件后再按需读取，不整份流进上下文。
- Node ≥20；失败时 stderr 只输出一行 `anydoc: <message>`，不交互。

## 退出码

| 码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 转换失败 |
| 2 | 用法错误 |
| 3 | PDF 含需 OCR 的扫描页 |

**扫描版 PDF 默认走 `--ocr hosted`**（送 Firecrawl Parse，文档离开本机，执行前按安全边界章节先向用户确认内容与去向）。

## 代码内集成

用库 `@firecrawl/anydoc`（npm）/ `firecrawl-anydoc`（PyPI）/ `anydoc`（crates.io），统一 `to_markdown` API。

## 上下游依赖

- 上游：用户喂入的非 markdown 材料（`docs/raw/` 场景一）；安装器（全局安装固定版本）。
- 下游：转出的 `.md` 与原件一同放入 `raw/` 对应子目录（原件保留不动，`.md` 属新增），以转出的 markdown 为沉淀依据。

## 重要变更记录

- 2026-09-18 从 `rules/AGENTS.md` 9.7 章迁移全部细节到本页（规则瘦身，见 [规则文件瘦身与核心规则卡](../decisions/rules-slim-and-core-rules.md)）。

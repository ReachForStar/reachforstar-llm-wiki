---
title: llm-wiki 目标文档类型 markdown 与 anydoc 转换工具
type: decision
tags: [llm-wiki, anydoc, markdown, 格式转换, 知识库]
created: 2026-09-16
updated: 2026-09-16
sources: []
status: active
---

# llm-wiki 目标文档类型 markdown 与 anydoc 转换工具

## 背景（现状与约束）

- 知识库三层架构中 Raw 层接收用户喂入的原始材料，实际材料常为 doc/docx/pptx/xlsx/pdf/epub 等二进制格式；LLM 与 qmd 都只能消费文本，非 markdown 材料无法直接检索与沉淀。
- 此前方案未规定统一转换工具，转换行为依赖临时手段（手动、pandoc 等），输出格式不一致（表格/脚注/公式处理各异），且 Agent 可能漏转。
- 约束：转换工具必须覆盖常见办公格式、输出统一的 GFM、可免安装或低维护成本运行、不引入常驻服务。

## 备选方案（各方案优劣）

1. **anydoc（firecrawl）**：Rust 实现的文档转 GFM 工具，CLI（`npx -y @firecrawl/anydoc`）/Node/Python/Rust 库统一 `to_markdown` API；覆盖 17 种格式（doc/docx/docm、ppt/pptx/pptm/pps、xls/xlsx/xlsm/xlsb/ods/odt、rtf、epub、csv、pdf）；按内容自动识别格式；表格/标题锚点/脚注/LaTeX 公式/演讲者备注统一渲染；毫秒级；MIT 许可。缺点：不做 OCR（扫描页需 `--ocr hosted` 走外部服务）。
2. **pandoc**：生态成熟，但 pptx/xlsx 支持弱（基本只能出 outline/文本），表格与公式保真度差；需额外安装，Windows 下维护成本高。
3. **LLM 直接读二进制**：多数格式不可读（docx 是 zip 包）；强行 base64/解压读 XML 成本高且不稳定，不可作为方案。

## 决策（选定方案）

- 知识库**目标文档类型为 markdown**：`docs/raw/` 沉淀依据与 `docs/wiki/` 页面一律 markdown。
- 非 markdown 材料一律用 **anydoc** 转换：`npx -y @firecrawl/anydoc <文件> -o <名>.md`（大文档写文件再按需读；stdin 需 `--format`）。
- 转出的 `.md` 与原件一同放入 `raw/` 对应子目录：原件保留不动（只读铁律），`.md` 属新增文件；sources 页以转出的 markdown 为沉淀依据。
- 默认不做 OCR；确需 OCR 时 `--ocr hosted` 会发送整份文档到 Firecrawl Parse（外部服务），按安全边界先向用户确认。
- 规则落点：`rules/AGENTS.md` 11.1（场景一转换步骤）与 12.5（anydoc 关键用法，细节见 [entities/anydoc](../entities/anydoc.md)）。

## 理由（决策依据）

- 单一工具覆盖全部目标格式，输出统一 GFM，与 wiki 页面格式一致（交叉引用、表格、公式可直接复用）。
- 免安装（npx 首跑自动拉取预编译二进制），无常驻依赖，维护成本最低；本机已装 `convert-documents-to-markdown` skill 即基于 anydoc，无新增维护面。
- Rust 实现性能好（毫秒级），内容识别格式可避免扩展名误导；失败行为确定（退出码 0/1/2/3，不交互），适合 Agent 脚本化调用。
- 退出码 3（需 OCR）明确区分「本地可转」与「需外部服务」，安全边界可控。

## 后果（影响与后续）

- `raw/` 将出现「原件 + 同名 .md」配对；原件仍受只读铁律保护，`.md` 只允许新增。
- **版本固定 0.2.4**：本仓库 `devDependencies` 精确版本本地安装（`node_modules/.bin/anydoc`，离线可用），规则命令带版本号（`npx -y @firecrawl/anydoc@0.2.4`）；升级需改两处并重新验证。
- 扫描版 PDF 默认不可转（退出码 3），**默认走 `--ocr hosted`**（用户已确认方案；文档离开本机，执行前仍按安全边界确认内容与去向）；转换质量依赖源文档结构，复杂表格可能降级为纯文本，沉淀时以实际输出为准。
- anydoc 若停维护可替换工具（pandoc 等），只需改 12.5 用法，「目标文档类型 markdown」的约定不变。

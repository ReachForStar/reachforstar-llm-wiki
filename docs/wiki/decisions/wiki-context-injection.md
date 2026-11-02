---
title: 用 hook 自动注入 wiki 上下文
type: decision
tags: [知识库, 上下文注入, hook, qmd]
created: 2026-09-15
updated: 2026-09-15
sources: []
status: active
---

# 用 hook 自动注入 wiki 上下文

## 背景（现状与约束）

`rules/AGENTS.md` 已规定“先查 wiki、完成后沉淀”并分发到三端，但实际运行中 Agent 几乎不主动读 `docs/wiki/`，沉淀的知识无人消费。同时 qmd 虽已安装，本项目 `.qmd/index.yml` 的 `collections: {}` 为空——即使 Agent 想起来用，检索结果也是空。

> 本决策只解决“读”；“写”的时机后来由「任务完成后」改为「**过程中即沉淀**」（每完成一项 / 每验证一个结论就写回），避免整任务一次性沉淀时“收尾忘了写什么”；见 `rules/AGENTS.md` 1.1 / 11.1 与 `log.md` `2026-09-15` 条目。

约束：三端（pi / Claude Code / Codex）都要生效；不引入外部服务依赖；不拖慢或阻断会话启动；失败必须可降级。

## 备选方案（各方案优劣）

1. **只强化规则文本**（写得更醒目、多加章节）：零成本，但仍是“请求 Agent 主动去读”，同类失效已发生一次，预期收益低。
2. **只提供 MCP/原生检索工具**（`qmd mcp`）：工具在工具列表里可见，但“何时查”仍靠 Agent 自觉；且不解决“索引为空”，也不展示索引内容。
3. **hook 会话注入**（新增 `wiki-memory` hook）：首轮把索引与最近记录直接放进上下文，读取成本为零；hook 在 cwd 运行，天然 project-aware；与已有 tmp-guard / output-filter 的分发机制一致，三端可复用。
4. **把知识库做成 skill**：skill 面向“能力/流程”而非“项目事实”，且 `skills/` 由安装器全量覆盖，不适合承载项目私有知识。

## 决策（选定方案）

采用方案 3（`wiki-memory` hook），并叠加少量方案 1 的规则对齐（`AGENTS.md` 新增 11.0 并强化 11.2 / 12.1）；方案 2 的 `qmd mcp` 注册作为可选增强写入 README，不默认改动用户配置。

## 理由（决策依据）

- 直接消除根因：Agent 不读的实质是“读取有成本且无触发点”，注入把成本降为零并自带触发时机。
- 同一机制已有实证：tmp-guard 的会话首轮注入（中间文件约定）确实被遵守。
- 复用现有 hook 分发链路，无新增依赖；qmd 自动初始化是本地离线操作（`init` / `collection add` / `update` 不下载模型），实测启动开销约 1–2s。
- 失败可降级：qmd 不可用时回退 `rg`；无 `docs/wiki` 的项目静默；`WIKI_MEMORY_QMD=0` 可关闭。

## 后果（影响与后续）

- 正面：知识库进入 [知识消费回路](../concepts/knowledge-consumption-loop.md)；qmd 从闲置变为开箱可用；规则与机制互相强化（规则说明“为什么”，hook 保证“一定发生”）。
- 代价：每个含 `docs/wiki` 的项目会生成 `<root>/.qmd/` 本地索引目录（建议加入项目 `.gitignore`，可用 `WIKI_MEMORY_QMD=0` 关闭）；首轮注入约占用 2–6KB 上下文。
- 后续：观察注入内容是否被实际引用；若仍被忽略，可在 `tool_result` 层面追加“编辑代码后提醒沉淀”的即时提示；wiki 规模增长后再评估是否把整份索引替换为 qmd 检索结果。

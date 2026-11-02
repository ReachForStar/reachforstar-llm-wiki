---
type: index
updated: 2026-11-02
---

# Wiki 索引

> 按类别列出本仓库全部 Wiki 页面，每次 ingest / 查询回写后由维护者更新。
> 格式：`[页面标题](相对路径) — 一行摘要`
> 读取顺序：先看本索引定位页面，再深入对应文件。
> 本仓库页面均复制自 [ReachForStar/skills](https://github.com/ReachForStar/skills) 的 `docs/wiki/`（基线 commit `9589405`），只收录 LLM Wiki 模式与 wiki-memory hook 相关页面。

## 主题总览

- 机制入口：[wiki-memory hook](entities/wiki-memory-hook.md) 在会话首轮注入目录树与检索命令；[LLM Wiki 模式](concepts/llm-wiki-pattern.md) 给出三层知识库架构定义。
- 检索工具：[qmd](entities/qmd.md) 是 wiki 检索的必选项；[index vs embedding](concepts/embedding-vs-index.md) 区分导航与检索两种消费方式。
- 材料入口：[anydoc](entities/anydoc.md) 是非 markdown 材料转 markdown 的唯一通道，见[对应决策](decisions/llm-wiki-markdown-anydoc.md)。
- 闭环视角：[知识消费回路](concepts/knowledge-consumption-loop.md) 连接沉淀、注入、引用与再沉淀。

## 实体 entities

- [wiki-memory hook（知识库自动注入）](entities/wiki-memory-hook.md) — 自动建库；首轮注入目录树与检索命令（不注入正文）；把 qmd 准备到可用（后台自动安装、建索引、失效集合重绑、Qoder 项目级 MCP 注册）
- [qmd（本地知识库检索工具）](entities/qmd.md) — BM25＋向量＋重排三合一本地检索；安装、索引范围、命令、换源与 GPU 加速；集合定位契约与五端 MCP 注册位置
- [anydoc（文件格式转换）](entities/anydoc.md) — doc/ppt/xls/pdf/csv 等转 GFM markdown；固定版本 0.2.4、退出码含义与 OCR 边界

## 概念 concepts

- [LLM Wiki 模式](concepts/llm-wiki-pattern.md) — raw（只读源层）/ wiki（沉淀层）/ AGENTS.md（schema 规则层）三层职责与不变量
- [知识库检索：index vs embedding](concepts/embedding-vs-index.md) — 目录树导航与向量检索的分工，为何注入导航而不是正文
- [知识消费回路](concepts/knowledge-consumption-loop.md) — 沉淀 → 注入 → 引用 → 再沉淀的闭环与断点排查

## 材料 sources

- [LLM Wiki 模式（原版思路文档）](sources/llm-wiki.md) — 原始参考材料的要点总结，对应 `docs/raw/references/llm-wiki.md`

## 决策 decisions

- [用 hook 自动注入 wiki 上下文](decisions/wiki-context-injection.md) — 被动规则失效的解法：把导航送到眼前而非要求 Agent 主动去读
- [llm-wiki 目标文档类型 markdown 与 anydoc 转换工具](decisions/llm-wiki-markdown-anydoc.md) — 非 markdown 材料先转 markdown 再沉淀
- [qmd MCP 原生工具由可选改为必选](decisions/qmd-native-mcp-required.md) — 检索工具在各端以原生工具形态提供，不再依赖 Agent 记得调 shell

## 排查 queries

- [wiki-memory pi 扩展“不生效”](queries/wiki-memory-pi-not-injecting.md) — 扩展只在进程启动时加载，长会话需 `/reload` 或重启
- [qmd embed 自动触发“没执行”](queries/qmd-embed-not-running.md) — 全局冷却标记、先写标记与文案失实三处成因
- [qmd get 报 Document not found](queries/qmd-get-path-resolution.md) — 路径按集合根解析，`docs/wiki/...` 形态依赖全项目集合
- [qmd 检索与 MCP 双失效](queries/qmd-stale-collection-path-and-mcp-cwd.md) — 集合遗留 Windows 路径 + Qoder MCP 子进程工作目录固定为 HOME
- [qmd 模型下载换源与 GPU 加速诊断](queries/qmd-model-source-and-gpu.md) — HF_ENDPOINT 换源与 `qmd doctor` 判定

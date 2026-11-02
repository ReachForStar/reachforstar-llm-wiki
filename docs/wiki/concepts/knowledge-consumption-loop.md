---
title: 知识消费回路（沉淀 → 注入 → 引用 → 再沉淀）
type: concept
tags: [知识库, 上下文注入, hook, 规则失效]
created: 2026-09-15
updated: 2026-09-15
sources: []
status: active
---

# 知识消费回路

## 定义

知识库的价值不在“写了多少页”，而在“下次任务是否真的用上”。只有**写入（沉淀）**与**读取（消费）**构成闭环，知识才会复利；只写不读的知识库是死档案。

## 问题模式：规则失效

`AGENTS.md` 里写「会话冷启动先读 `index.md`、写完代码再沉淀」属于**被动规则**，实测触发率很低：

- 规则混在长文档里，触发点不在动作发生处（要改代码时不会想起第 11 章）；
- 上下文一长、任务一急，Agent 倾向走最短路径，跳过“额外的”读取；
- 即使装了 qmd，也只是“可选工具”：没有触发时机，也没有就绪保证（初始 `collections: {}` 时检索为空），于是闲置。

结论：**靠“提醒 Agent 去读”不可靠，必须把知识送到 Agent 眼前**。

## 回路设计

| 环节 | 措施 | 落地 |
| --- | --- | --- |
| 写入 | **过程中即沉淀**：每完成一项 / 每验证一个结论就写入（模块 / 决策 / 踩坑），不攒到收尾 | `rules/AGENTS.md` 11.1、14 章 |
| 写入提醒 | 改过代码却未写回 wiki 时在工具结果末尾提醒一次 | [safe-guard hook](../entities/safe-guard-hook.md) |
| 逐项写入提醒 | 清单勾选后未写回 wiki 时提醒（把 2.8 变成时机提醒） | [task-flow hook](../entities/task-flow-hook.md)、`rules/AGENTS.md` 2.8 |
| 注入 | 会话首轮注入**目录树**（路径+标题）与检索命令，正文按需取 | [wiki-memory hook](../entities/wiki-memory-hook.md) |
| 引用 | 回答必须给页面相对路径引用；检索结果回原文核对 | `rules/AGENTS.md` 11.2 章 |
| 检索 | **qmd 优先**（`qmd search` / `query`）→ 不可用或结果不理想才回退 `rg`；qmd 由 hook 自动就绪 | `rules/AGENTS.md` 11.2、12.1 章 |
| 再沉淀 | 有长期价值的问答回写 `queries/` | `rules/AGENTS.md` 11.2 章步骤 3 |

## 要点

1. **触发点要贴着动作**：约束写在“动手前 / 每完成一项”这类动作节点上，比集中写在章节里有效。
2. **注入结构而非内容**：hook 注入的持久消息等于“免费可用的导航”（目录树 + 检索命令），而页面正文按需检索——既不爆上下文，又绕过 Agent 的主动性缺陷（tmp-guard 的约定注入已验证该机制会被遵守）。
3. **工具要就绪**：给工具不等于能用（qmd 无集合时检索为空）；hook 自动建索引让工具“开箱即用”。
4. **降级路径必备**：任何自动机制都要有不依赖外部组件的回退（`rg`），否则环境差异会让整个回路断裂。
5. **写入要有强制力**：把节点从“收尾”提前到“每完成一项”后仍需兼底——在“已完成代码改动”这个信号上追加一次提醒（safe-guard），避免沉淀漏做而回路断开。
6. **写入边界**：过程中的发现都可以当场记下——已验证的写结论，未定论的写成开放问题并标 `status: draft`／“待核验”，验证后再补正。要防的不是“写早了”，而是不标状态地把猜想写成结论（后来者无从分辨真假）。
7. **粒度要匹配任务节奏**：整任务一次性沉淀容易“收尾时忘了写什么”；把任务拆成落盘清单，每勾选一项就沉淀一项（task-flow），写入触发点因此密而小。

## 关联页面

- 实体：[wiki-memory hook](../entities/wiki-memory-hook.md)、[safe-guard hook](../entities/safe-guard-hook.md)、[task-flow hook](../entities/task-flow-hook.md)
- 决策：[用 hook 自动注入 wiki 上下文](../decisions/wiki-context-injection.md)
- 概念：[LLM Wiki 模式](llm-wiki-pattern.md)、[知识库检索：index vs embedding](embedding-vs-index.md)

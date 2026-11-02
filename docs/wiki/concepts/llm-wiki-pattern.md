---
title: LLM Wiki 模式
type: concept
tags: [方法论, 知识管理, agent, wiki]
created: 2026-09-08
updated: 2026-09-08
sources: [raw/references/llm-wiki.md]
status: active
---

# LLM Wiki 模式

## 定义

一种用 LLM 增量构建、持续维护个人/项目知识库的模式：LLM 读取原始资料并「编译」成互链的 Markdown Wiki，人负责选源、提问与把关。

## 核心思想

- 对比 RAG：RAG 每次查询时从原始文档重新检索拼装（无积累）；Wiki 模式把知识沉淀为持久、复利增长的资产，交叉引用与矛盾标注都提前完成。
- 「Obsidian 是 IDE，LLM 是程序员，Wiki 是代码库」——本仓库去掉 GUI 后的等价说法：终端是 IDE，Pi 是程序员，Markdown 文件是代码库。

## 三层架构

| 层 | 职责 | 归属 |
| --- | --- | --- |
| Raw 原始源 | 原始资料，不可变，事实基准 | 人（只读） |
| Wiki 知识层 | 互链页面：总结/实体/概念/决策 | LLM 全权维护 |
| Schema 规则层 | 规则文件（AGENTS.md）定义结构与工作流 | 人 + LLM 共同演化 |

## 三大操作

- **Ingest 摄入**：源 → 总结页 → 更新实体/概念页 → 刷新 index → 追加 log
- **Query 查询**：index 定位 → 检索相关页 → 带引用作答 → 好答案回写为 queries 页
- **Lint 检查**：矛盾、过期声明、孤儿页、缺页概念、缺失交叉引用

## 关键设计

- index.md（内容索引）+ log.md（时序日志，固定前缀可 grep 解析）
- 中规模（约 100 源、数百页）内不依赖 embedding RAG 基础设施
- 本质是 Markdown git 仓库：版本历史、分支、协作免费获得

## 本仓库的实例化

- 适配 Pi/OpenCode 类代码 Agent 的项目仓库记忆工具：无 GUI，纯文件 + CLI（qmd/git/glow）
- 规则落在 AGENTS.md（本仓库 schema 层）

## 关联

- 源：[源总结页](../sources/llm-wiki.md)
- 相关概念：[知识库检索：index vs embedding](embedding-vs-index.md)
- 相关决策：（暂无）

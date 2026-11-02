---
title: LLM Wiki 模式（原版思路文档）
type: source
tags: [方法论, 知识管理, agent]
created: 2026-09-08
updated: 2026-09-08
sources: [raw/references/llm-wiki.md]
status: active
---

# LLM Wiki 模式（原版思路文档）

## 一句话总结

让 LLM 增量构建并持续维护一个互链的 Markdown Wiki，作为人与原始资料之间的持久知识层；知识「编译一次、持续更新」，而不是每次查询时从零重新推导。

## 关键要点

1. 与 RAG 的本质区别：RAG 每次查询时从原始文档重新检索拼装，无积累；Wiki 模式把知识结构化沉淀为持久资产，交叉引用与矛盾标注提前完成，越用越厚。
2. 三层架构：Raw（不可变源，事实基准）/ Wiki（LLM 全权生成的互链页面）/ Schema（规则文件如 AGENTS.md，定义结构、约定、工作流）。
3. 三大操作：Ingest（读源→总结→更新相关页→刷新索引→记日志，一份源常触及 5–15 页）、Query（索引定位→带引用作答→好答案回写为页面）、Lint（查矛盾/过期声明/孤儿页/缺页概念/缺引用）。
4. index.md 面向内容、log.md 面向时间线（固定前缀可用 grep 解析），二者是中规模（约 100 源）下的导航核心，避免 embedding RAG 基础设施。
5. 可选 CLI 工具：qmd（本地混合搜索，BM25+向量+重排）等；wiki 本质是 git 仓库，版本历史免费获得。
6. 为什么有效：人类放弃知识库是因为维护负担增长快于价值；LLM 让维护成本趋近于零。

## 与现有知识的关系

- 关联概念：[LLM Wiki 模式](../concepts/llm-wiki-pattern.md)、[知识库检索：index vs embedding](../concepts/embedding-vs-index.md)
- 修正/补充：本仓库即为该模式的项目仓库实例化——去 Obsidian，纯文件 + CLI 工具（qmd/git/glow），适配 Pi/OpenCode 类代码 Agent

## 存疑或待跟进

- 大规模（数千页）时是否需要向量检索基础设施，待 wiki 实际增长后验证

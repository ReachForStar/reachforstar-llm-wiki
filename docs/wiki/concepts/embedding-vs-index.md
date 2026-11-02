---
title: 知识库检索：index vs embedding
type: concept
tags: [检索, embedding, qmd, 选型]
created: 2026-09-08
updated: 2026-09-15
sources: [raw/references/llm-wiki.md]
status: active
---

# 知识库检索：index vs embedding

## 结论

本方案不需要自行部署、选型或付费的 embedding 模型。唯一相关的 embedding 组件是 qmd 内置的本地模型，由 qmd 自动下载与管理。

**本仓库策略：装了 qmd 就优先用它**——`qmd search`（BM25）/ `qmd query`（混合＋重排）是检索首选，`rg` 仅在 qmd 不可用或结果不理想时回退（见 `rules/AGENTS.md` 11.2、12.1）。下表是“要不要上 embedding 基础设施”的规模选型参考，不是“小库就该用 grep”的使用顺序。

## 规模分层决策

| 阶段 | 规模 | 检索方案 | 需要 embedding 吗 |
| --- | --- | --- | --- |
| 起步 | < 100 页 | index.md + grep | 不需要（原文档明确此规模下避免 embedding RAG 基础设施） |
| 扩容 | 100+ 页 | + qmd 混合搜索 | 无需自己部署：qmd 内置本地模型自动管理 |
| 远期 | 数千页 / 跨库 | 自建语义检索 | 才考虑（本地 bge-m3 或云 API）；对当前属过度设计 |

## qmd 模型细节

- 首次使用自动下载约 1GB GGUF 模型（embedding + 重排），托管于 HuggingFace，纯本地运行
- 无需选型、部署服务或 API key；BM25 部分完全不依赖模型
- 国内网络下载困难时：设置 `HF_ENDPOINT=https://hf-mirror.com` 后再运行

## 关联

- 源：[源总结页](../sources/llm-wiki.md)
- 相关概念：[LLM Wiki 模式](llm-wiki-pattern.md)

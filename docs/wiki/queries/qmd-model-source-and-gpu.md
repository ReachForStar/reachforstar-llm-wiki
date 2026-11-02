---
title: qmd 模型下载换源与 GPU 加速诊断
type: query
tags: [qmd, 网络, gpu, 模型下载, 排查]
created: 2026-09-15
updated: 2026-09-15
sources: []
status: active
---

# qmd 模型下载换源与 GPU 加速诊断

## 问题

1. `qmd embed` 打印 `Model: embeddinggemma-300M-Q8_0.gguf` 后**无响应**——模型从 HuggingFace 下载，国内网络卡死，且无进度输出，看似挂起。
2. `qmd query` / `qmd vsearch` 超时（>120s）无输出——首次 `query` 需**额外下载重排模型**（`Qwen3-Reranker-0.6B-Q8_0`，约 640MB，HF 源），同样静默卡死。

## 根因

qmd 依赖三个本地模型（缓存于 `~/.cache/qmd/models/`，命名 `hf_<org>_<repo>_<文件名>`）：

| 模型 | 用途 | 大小 |
|---|---|---|
| embeddinggemma-300M-Q8_0 | 向量嵌入（`embed` 时下载） | ~319MB |
| qwen3-reranker-0.6b-q8_0 | `query` 重排（**首次 query 时才下载**） | ~610MB |
| 查询扩写 LLM（tobil/qmd-query-expansion-1.7B） | `query` 自动扩写 | ~1.2GB |

下载源是 HuggingFace；qmd 没有自带换源参数，但走 `hf` 库，认 `HF_ENDPOINT` 环境变量。

## 解法

```bash
# 换国内镜像（一条命令内临时设置）
HF_ENDPOINT=https://hf-mirror.com qmd embed
# PowerShell 写法：$env:HF_ENDPOINT='https://hf-mirror.com'; qmd embed
```

实测：镜像下 `qmd embed` 25s 完成 18 文档 49 chunk；首次 `query` 顺带拉下重排模型，之后全离线。

## GPU 加速（无需配置，自动启用）

- qmd 底层是 node-llama-cpp，预构建含 `win-x64-cuda`，**设备模式默认 auto**：检测到 CUDA 即用 GPU（含 offload），检测不到回退 CPU 并警告。
- 诊断：`qmd doctor` 一锤定音——device probe 行显示 `GPU cuda; offloading enabled; devices: NVIDIA GeForce RTX 4070; VRAM …`。
- 强制 CPU 对比/排障：`QMD_FORCE_CPU=1` 或 `--no-gpu`。
- 注意小库上 GPU 与 CPU 耗时差异被结果缓存掩盖（重排可命中 2ms 缓存），别用单次计时判断 GPU 是否生效，以 `qmd doctor` 为准。

## 涉及模块

- [wiki-memory hook](../entities/wiki-memory-hook.md)：只负责 qmd 二进制自动安装与索引刷新，**不负责模型下载**——模型下载在首次 `embed`/`query` 时发生。
- 规则 `rules/AGENTS.md` 9.1 已记载 `HF_ENDPOINT` 换源提示。

## 复发预防

- 国内网络首次启用 qmd 语义检索时，直接用镜像命令跑 `qmd embed` 与一次 `qmd query`，把三个模型一次拉齐，后续全部离线。
- 怀疑设备/模型问题时先跑 `qmd doctor`（索引健康、模型缓存、设备探测、向量抽样复验一次全给）。

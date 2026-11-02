---
title: qmd（本地知识库检索工具）
type: entity
tags: [qmd, 检索, BM25, 向量, MCP]
created: 2026-09-18
updated: 2026-10-07
sources: []
status: active
---

# qmd（本地知识库检索工具）

## 职责

`docs/wiki` 的检索工具：BM25 关键词＋向量＋重排，**必选项**，优先级高于 `grep`/`rg`。规则文件（`rules/AGENTS.md` 9.1）只保留关键用法，本页承载全部细节。

## 定位与优先级

- 查找 wiki 内容一律先 qmd（带 BM25＋向量＋重排，相关性与命中率高于纯文本匹配）；只有它不可用或结果不理想时才回退 `grep`/`rg`，两者都无线索时才通读代码。
- 优先级链：**原生 qmd MCP 工具 > shell `qmd` 命令 > `grep`/`rg` 回退**。

## 安装

- `npm install -g @tobilu/qmd`（**Node ≥22**；也可 `bun install -g @tobilu/qmd` 或 `npx @tobilu/qmd`）。
- [wiki-memory hook](wiki-memory-hook.md) 检测不到 qmd 时**后台自动安装**（`WIKI_MEMORY_INSTALL_QMD=0` 关闭、`QMD_INSTALL_CMD` 换命令），当次会话先用 `rg` 回退，下次会话自动就绪；同一机器 6 小时内不重复触发。

## 索引定位契约（关键，坑点）

qmd 靠**进程工作目录**定位索引：`dist/collections.js` 的 `findLocalConfigPath()` 从 `process.cwd()` 逐级上溯找 `.qmd/index.yml`，找不到回落到全局 `~/.config/qmd/index.yml`。因此：

- 项目索引 = `<项目根>/.qmd/index.yml`（集合定义 + 模型）+ 同目录 `index.sqlite`（`getLocalDbPath()` 由 yaml 路径推导）。
- 集合的 `path:` 是绝对路径，**目录不存在时 qmd 静默跳过**：`qmd update` 照报 `✓ All collections updated.`，`qmd status` 却是 `Total: 0 files indexed`，向量全成孤儿。仓库换机器/换盘符后必现（`.qmd/` 被 gitignore，不随仓库迁移）。
- `INDEX_PATH` 环境变量只覆盖 DB 路径（`dist/store.js`），**不改变集合来源**；单独设置得到空索引。要指过去必须 `QMD_CONFIG_DIR` + `INDEX_PATH` 成对指向 `.qmd/`，代价是写死绝对路径。
- **就绪判据只看 `qmd status` 的 `Total: N files indexed`**（应约等于 wiki 页数 + 全项目集合的 md 数），不看 `qmd update` 文案；MCP 是否可用看 `qmd status` 工具的 `totalDocuments`，不是工具是否出现在列表里。

细节与排查见 [qmd 检索与 MCP 双失效](../queries/qmd-stale-collection-path-and-mcp-cwd.md)。

## 索引（wiki-memory hook 自动维护）

会话开始时 hook 依次执行（幂等）：

1. `qmd init`（索引不存在时生成 `<root>/.qmd/` 索引文件）
2. **失效集合自动重绑**：集合 `path` 在本机不存在、或同名集合指向别处时先 `collection remove`，再走下面的 add（迁移后无需手工）
3. `collection add docs/wiki --name wiki`（知识库集合）+ `context add qmd://wiki`（集合描述）
4. `collection add . --name project`（全项目集合，best-effort：使 `qmd get docs/wiki/...` 项目根相对路径可解析，机制见 [qmd get 路径解析坑](../queries/qmd-get-path-resolution.md)）
5. `qmd update`（刷新 BM25 索引；**空库（0 页）同样建集合**）；绑定发生过变化时追加一次 `qmd status` 复核，仍 0 篇则报 `state: empty` 并提示核对 path
6. 后台触发 `qmd embed`（生成 `.qmd` 向量索引文件，首次下载本地模型到 `~/.cache/qmd/models`，不阻塞会话；按项目 1 小时冷却，上次没跑完（pending>0）时冷却内也自动重试；`WIKI_MEMORY_EMBED=0` 关闭）

手动维护：`qmd update`（沉淀后立即生效）、`qmd embed`（向量索引）、`qmd collection list|remove|add`（集合绑定失效时重绑，hook 已自动化）、`qmd cleanup`（摘除孤儿向量）。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `qmd search "<关键词>"` | BM25 关键词，离线可用（首选） |
| `qmd query "<自然语言问题>"` | 混合检索＋重排，最强（重排与查询扩写模型在**首次 `qmd query`** 时才下载） |
| `qmd get <path> --full` | 取整页；`<path>` 直接取目录树路径如 `entities/xxx.md`，有全项目集合时 `docs/wiki/...` 亦可 |
| `qmd multi-get "<glob>"` | 批量取 |
| `qmd status` | 索引健康 |
| `qmd doctor` | 设备/索引/模型健康一锤定音 |

完整语法以 `qmd --help` 为准。

## 原生 MCP 工具（必选）

`qmd mcp` 注册为各端 MCP server（暴露 `query` / `get` / `multi_get` / `status` 四个工具）。**注册位置取决于该端 MCP 子进程的工作目录**（见上方索引定位契约）：

| 端 | 注册方式 | 备注 |
| --- | --- | --- |
| pi | 合并 `~/.pi/agent/mcp.json` 的 `mcpServers.qmd` | 子进程 cwd = 会话项目根，用户级注册即可发现项目索引 |
| Claude Code | `claude mcp add --scope user qmd -- qmd mcp` | 子进程继承父进程 cwd |
| Codex | `codex mcp add qmd -- qmd mcp` | 同上 |
| OpenCode | 经 `reachforstar-wiki-memory.js` 插件运行时注入 `mcp.qmd`（V1 `config` hook / V2 `mcp.transform`，不改 `opencode.json`） | 子进程未设 cwd 时继承项目根 |
| dsh | 写 `$DSH_HOME/cordis.patch.yml` 的 `@deepseek-ai/dsh-mcp-client` 托管块（`serverName: qmd`） | 子进程 cwd = dsh 启动目录（未设 `cwd` 时实测继承）；`--type mcp` 写入，改后重启 dsh 或由 HMR 重载 |
| Qoder | **项目级 `<项目根>/.qoder/.mcp.json`，条目必须带 `cwd`**：`{"command":"qmd","args":["mcp"],"cwd":"<项目根>","env":{}}` | 子进程 cwd 固定为用户主目录，用户级注册恒为 0 篇；由 wiki-memory hook 在 Qoder 会话启动时写入，改后需重启 Qoder；`WIKI_MEMORY_QODER_MCP=0` 关闭 |

pi/Claude Code/Codex/dsh 四端由安装器 `--type mcp`（或 `all`）自动完成；Qoder 端安装器**只打印提示、不写用户级配置**（写了也不生效，且会与项目级同名重复）。CLI 缺失或注册失败只提示手动命令不阻断。决策依据见 [qmd MCP 原生工具必选化](../decisions/qmd-native-mcp-required.md)，Qoder 例外实测见 [qmd 检索与 MCP 双失效](../queries/qmd-stale-collection-path-and-mcp-cwd.md)。

## 模型下载换源与 GPU

- 模型从 HuggingFace 下载，国内网络受限先设 `HF_ENDPOINT=https://hf-mirror.com` 换源（不换源会静默卡死）。
- node-llama-cpp 默认 auto，检测 CUDA 即自动启用（含 offload），无需配置；强制 CPU 用 `QMD_FORCE_CPU=1` 或 `--no-gpu`。
- 详见 [qmd 模型换源与 GPU 诊断](../queries/qmd-model-source-and-gpu.md)。

## 降级

- `WIKI_MEMORY_QMD=0` 关闭自动索引；`WIKI_MEMORY_QODER_MCP=0` 只关 Qoder 项目级 MCP 写入；qmd 不可用时用 `rg -n "<关键词>" docs/wiki`，任务照常推进（不阻塞）。

## 上下游依赖

- 上游：各项目 `docs/wiki/`（无则不建索引）；wiki-memory hook（自动维护索引 + Qoder/OpenCode 注册）；安装器 `--type mcp`（pi / Claude Code / Codex / dsh 注册，见 [mcp-install.mjs](../../bin/mcp-install.mjs)）。
- 下游：Agent 的检索动作（原生 MCP 工具或 shell 命令）；`<root>/.qmd/` 本地索引目录（建议 gitignore）；`<root>/.qoder/.mcp.json`（Qoder 会话写入，含本机绝对路径，同样 gitignore）。

## 重要变更记录

- 2026-10-07 补「索引定位契约」与 MCP 注册位置表：qmd 按 `process.cwd()` 上溯找 `.qmd/index.yml`，集合 path 不存在时静默跳过（`update` 绿灯但 0 篇），`INDEX_PATH` 单独无效；Qoder 因 MCP 子进程 cwd 固定为主目录，改由 wiki-memory hook 写项目级 `.qoder/.mcp.json`（带 `cwd`）。附 hook 索引步骤新增失效集合自动重绑与 `state: empty` 复核。见 [qmd 检索与 MCP 双失效](../queries/qmd-stale-collection-path-and-mcp-cwd.md)。
- 2026-09-18 从 `rules/AGENTS.md` 9.1 章迁移全部细节到本页（规则瘦身：规则侧只留关键用法，见 [规则文件瘦身与核心规则卡](../decisions/rules-slim-and-core-rules.md)）。

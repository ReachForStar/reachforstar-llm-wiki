# wiki-memory · 知识库自动建库、导航注入与 qmd 就绪

让 AI 编码助手**无需记得去读**也知道项目知识库在哪：会话开始时自动建好知识库骨架，注入「目录树 + 最近记录 + 检索命令」，并把 qmd 准备到可用状态；正文一律按需检索读取。支持四端：**pi** / **Claude Code** / **Codex** / **OpenCode**（桥接插件 `reachforstar-wiki-memory.js`：V1 `config` hook / V2 `mcp.transform` 注册 qmd MCP，V1 `system.transform` / V2 `session.context` 每次请求注入 digest——opencode 每次 LLM 请求重建 system prompt，digest 按目录缓存 10 分钟避免重复跑脚本）。

## 解决的问题

`AGENTS.md` 里的「先查 wiki、按逻辑里程碑沉淀」是**被动规则**：上下文一长、任务一急，Agent 就不再主动去读 `docs/wiki/`，沉淀的知识无人消费，qmd 也闲置（甚至根本没装）。本 hook 把「主动去读」变成「结构已送到眼前、内容按需检索」，并顺手把检索工具准备好。

## 工作机制

| 时机 | 行为 |
| --- | --- |
| 会话开始 | 从 cwd 向上查找 `docs/wiki/index.md`；未命中且处于带项目标记的项目根时，创建 `docs/raw/`（articles/meetings/references/assets）与 `docs/wiki/`（五类目录 + index.md + log.md）骨架 |
| 会话开始 | 确保 qmd 就绪：`qmd status` 探活 → 缺失则**后台自动安装** → 无 `.qmd` 则 `init`（生成索引文件）→ 无 docs/wiki 集合则 `collection add docs/wiki --name wiki` + `context add qmd://wiki` → `update` → **后台触发 `qmd embed`** 生成向量索引文件（机制见下「离线」条） |
| 首轮对话 | 注入「知识库导航」：目录树（分类 + 每页路径与标题，上限 60 条）+ `log.md` 最近 5 条 + 检索命令 + qmd 状态；**不注入页面正文**；空库提示按里程碑结构化沉淀，收尾关联条目、补总览和分类 |

注入内容不包含 `index.md` 正文与页面内容，避免占用上下文；`index.md` 保留为人工/显式查阅的完整目录。

## 注入内容示例

```
【项目知识库 LLM Wiki｜wiki-memory hook 自动注入】
根目录：docs/wiki/ 共 16 页（entities 6 · concepts 5 · sources 1 · decisions 3 · queries 1）
目录树（只给清单与标题，正文按需检索读取）：
- entities/ (6)
  · entities/installer.md — 一键安装器 install.mjs
  · entities/safe-guard-hook.md — safe-guard hook（危险操作硬拦截）
  ...
最近操作（log.md 尾部）:
  [2026-09-15] feat | wiki-memory 改注入目录树并支持自动安装 qmd
检索（优先 qmd，`grep`/`rg` 仅作回退；按需定位后再读页面，不要通读全部）:
  · `qmd search "<关键词>"` — BM25 关键词，离线可用（首选）
  · `qmd query "<自然语言问题>"` — 混合检索＋重排，最强（向量索引由 hook 在会话开始后台生成）
  · `qmd get docs/wiki/entities/xxx.md --full` — 取整页
  · 回退（qmd 不可用或结果不理想）：`rg -n "<关键词>" docs/wiki`
  · qmd 状态：已就绪（本次已刷新索引），检索首选 qmd
  · 向量索引：已就绪（1 小时内生成过，当前无待嵌入文档）
必须遵守（AGENTS.md 第 11 章）：...
```

## qmd 说明

- **安装**：官方方式 `npm install -g @tobilu/qmd`（Node ≥22；或 `bun install -g @tobilu/qmd` / `npx @tobilu/qmd`）。检测不到 qmd 时本 hook 会**后台触发**该命令，不阻塞会话；本次会话用 `rg` 回退，下次会话自动就绪。6 小时内不重复触发；`WIKI_MEMORY_INSTALL_QMD=0` 关闭；`QMD_INSTALL_CMD` 可换成 bun/镜像等自定义命令。
- **索引范围**：项目本地 `docs/wiki`（集合名 `wiki`，`<项目根>/.qmd/` 为 qmd 项目索引目录，建议加入项目 `.gitignore`）。
- **离线**：`init` / `collection add` / `context add` / `update` / `search` 全程本地，不下载模型。`qmd embed`（向量）由本 hook 在会话开始**后台触发**（不阻塞会话；**按项目 1 小时冷却**，上次没跑完（pending>0）时冷却内也自动重试；`WIKI_MEMORY_EMBED=0` 关闭），首次会下载约 2GB 本地模型到 `~/.cache/qmd/models`（网络受限可先设 `HF_ENDPOINT=https://hf-mirror.com`）；`qmd query`（语义检索）首次另下载重排/扩写模型。
- **降级**：qmd 未安装、超时或刷新失败时，导航里如实标注状态并给 `rg -n "<关键词>" docs/wiki` 回退，不阻断会话。
- **原生工具（必选）**：`qmd mcp`（暴露 `query`/`get`/`multi_get`/`status`），安装器安装 hooks 时自动注册四端（OpenCode 经插件 V1 config hook / V2 mcp.transform 注入 `mcp.qmd`，不改 `opencode.json`），见仓库 README「知识库消费机制」。

## 开关

| 变量 | 作用 |
| --- | --- |
| `WIKI_MEMORY_QMD=0` | 关闭 qmd（自动安装 + 索引 + 刷新），只保留建库与导航注入 |
| `WIKI_MEMORY_INSTALL_QMD=0` | 只关闭“自动安装 qmd”，仍会尝试使用已装的 qmd |
| `WIKI_MEMORY_EMBED=0` | 只关闭“后台生成向量索引”，qmd query 首次使用时自行下载模型生成 |
| `WIKI_MEMORY_SCAFFOLD=0` | 关闭自动建库 |
| `QMD_INSTALL_CMD` | 覆盖安装命令（默认 `npm install -g @tobilu/qmd`） |

## 文件说明

- `wiki-memory.ts` — pi 扩展（`session_start` 建库/就绪 + `before_agent_start` 注入）
- `wiki-memory-hook.mjs` — Claude Code / Codex / OpenCode 共享脚本（SessionStart 输出 `additionalContext`）
- `reachforstar-wiki-memory.js` — OpenCode 桥接插件（V1 config / V2 mcp.transform 注册 qmd MCP + V1 `system.transform` / V2 `session.context` 注入 digest）
- `snippets/` — 各端 hook 配置示例

## 安装

```bash
# pi
cp wiki-memory.ts ~/.pi/agent/extensions/

# Claude Code / Codex
mkdir -p ~/.wiki-memory && cp wiki-memory-hook.mjs ~/.wiki-memory/
```

再把 `snippets/claude-settings.json` 的 `hooks` 合并进 `~/.claude/settings.json`，或把 `snippets/codex-hooks.json` 的 `hooks` 合并进 `~/.codex/hooks.json`。

> Codex 对 hook 有信任校验：首次启动交互模式会提示信任确认，确认后生效。

## 依赖

- Node.js（Claude Code / Codex 脚本；pi 扩展由 pi 自带运行时加载）
- [qmd](https://github.com/tobi/qmd)（必选，缺失时自动安装并注册为 MCP 原生工具；未就绪时自动降级 `rg`）
  - 本地模型（embedding ~319MB / 重排 ~610MB / 扩写 LLM ~1.2GB）在首次 `qmd embed` 与首次 `qmd query` 时从 HuggingFace 下载；国内网络用 `HF_ENDPOINT=https://hf-mirror.com` 换源，GPU（CUDA）自动启用，诊断用 `qmd doctor`（见 `docs/wiki/queries/qmd-model-source-and-gpu.md`）

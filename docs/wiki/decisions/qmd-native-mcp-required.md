---
title: qmd MCP 原生工具由可选改为必选（安装器自动注册）
type: decision
tags: [qmd, mcp, 检索, 安装器]
created: 2026-09-15
updated: 2026-10-07
sources: []
status: active
---

# qmd MCP 原生工具由可选改为必选（安装器自动注册）

## 背景

qmd 是 wiki 检索的首选工具（BM25＋向量＋重排），规则已要求「qmd 优先于 `rg`」。但「让 qmd 成为原生工具（MCP server）」此前标注为**可选**：README 只给出手动注册命令（`claude mcp add` / `codex mcp add` / pi 的 `mcp.json`），Agent 实际检索时多数走 shell `qmd` 命令，原生工具形同虚设，注册与否全靠用户自觉。

## 备选方案

- **A：保持可选，仅改文案强调**——成本最低，但约束仍停留在自觉层面，与本项目「禁止类/关键类规则下沉为机制」的一贯取向（见 [danger-rules-hard-block](danger-rules-hard-block.md)、[wiki-context-injection](wiki-context-injection.md)）冲突。
- **B：安装器自动注册**——把 `--type hooks` 流程扩展为「hooks 脚本/扩展 + qmd MCP 注册」，三端统一；幂等、dry-run 兼容、CLI 缺失不阻断。
- **C：wiki-memory hook 会话时注册**——把注册逻辑塞进 hook 会引入会话期副作用（每会话探测 + 注册），hook 定位是注入与索引，不承担配置写入。

## 决策

采用 B：**qmd MCP 注册为必选操作**，由安装器在安装 hooks 时自动完成三端注册：

- pi：合并 `~/.pi/agent/mcp.json` 的 `mcpServers.qmd`（缺失新建，带备份，幂等）；
- Claude Code：`claude mcp add --scope user qmd -- qmd mcp`（user 级全局生效）；
- Codex：`codex mcp add qmd -- qmd mcp`。

注册失败或 CLI 缺失只提示手动命令，不阻断安装（遵循「失败不阻塞」原则）。检索优先级链同步写入规则：**原生 qmd 工具 > shell `qmd` 命令 > `rg` 回退**。

## 理由

1. 原生工具免去 shell 往返，Agent 可直接结构化调用 `query`/`get`/`status`，检索路径最短。
2. 「必选」必须落在机制上才有约束力：文案式要求（方案 A）长会话中会被遗忘，安装器是唯一一次性的权威时点。
3. 失败降级保留：qmd 二进制本身由 wiki-memory hook 后台自动安装兜底，MCP 注册失败时 Agent 仍可走 shell `qmd` 或 `rg`，不产生硬依赖。

## 后果

- 安装 hooks 时多一步注册动作；重复安装幂等（pi 跳过、claude 报 already exists 视为成功、codex 重复 add 等价覆盖）。
- 规则（`rules/AGENTS.md` 11.2/12.1）与 README「让 qmd 成为原生工具（必选）」章节同步更新，手动命令保留为补注册参考。
- 后续若新增 MCP 依赖，参照本机制：安装器统一注册 + 规则声明优先级链。

## 修订（2026-10-07）：Qoder 端注册位置改为项目级

本决策的「安装器一次性注册」原则不变，但**注册位置必须按端区分**，且 Qoder 端改由 wiki-memory hook 维护——原备选方案 C 的部分理由被推翻。

**背景**：qmd 的原生工具要有意义，前提是 MCP 子进程能读到**本项目**的索引：`findLocalConfigPath()` 从子进程 `process.cwd()` 逐级上溯找 `.qmd/index.yml`。实测各端 stdio MCP 子进程：pi / Claude Code / OpenCode 继承项目根（用户级注册够用），Qoder 桌面与 CLI 固定为 HOME 且 env 只有 `HOME`/`LANG`/`PATH`（`/proc/<pid>/cwd` 实测），只能用项目级配置。证据与排查见 [qmd 检索与 MCP 双失效](../queries/qmd-stale-collection-path-and-mcp-cwd.md)。

**备选（Qoder）**：
- A 项目级 `<项目根>/.qoder/.mcp.json` + `cwd` 字段：可提交到仓库吗？不能——含本机绝对路径，故与 `.qmd/` 一同 gitignore；优点是每个项目自动生效、无需手工。
- B 用户级条目里写 `env: { INDEX_PATH: ... }`：实测**无效**（`INDEX_PATH` 只覆盖 sqlite 路径，集合仍来自全局空 yaml，`status` 恒 0 篇）。
- C 用户级条目成对写 `QMD_CONFIG_DIR` + `INDEX_PATH`：实测可用（129 篇），但把一台机器的绝对路径写死进全局配置，正是本次要修的失效类型。
- D 由安装器写项目级文件：安装器只在用户机器上跑一次，之后新建/克隆的项目无人注册。

**决策**：采用 A，并把它放在 wiki-memory hook（会话启动时按当前项目根写入/更新，幂等、不覆盖用户自定义 qmd 条目、`WIKI_MEMORY_QODER_MCP=0` 可关）；安装器对 Qoder 只打印提示与遗留配置清理提醒。

**理由**：原方案 C 拒的是「会话期副作用」，但当时副作用指**注册动作写用户级配置**；项目级 `.qoder/.mcp.json` 与 `.qmd/index.yml` 同性质（本地生成物、按项目、幂等），本来就是 hook 的职责范围，且只有会话时点才知道项目根。安装器一次性注册对「每个项目一份文件」的形态不成立。

## 2026-10-26 修订：注册动作归入 `--type mcp`，新增 dsh 端

- 注册从 `--type hooks` 挪到独立 `--type mcp`（`all` 包含），实现集中到 [bin/mcp-install.mjs](../../bin/mcp-install.mjs)。原「安装 hooks 时顺带注册」与 MCP 无逻辑关系，且 Excalidraw 等第二个 server 接入后无法单独重跑。
- 新增 dsh：MCP 只能通过 home 级 `$DSH_HOME/cordis.patch.yml` 插入 `@deepseek-ai/dsh-mcp-client` 行；实测子进程未设 `cwd` 时继承 dsh 启动目录，用户级注册即可发现项目索引。细节见 [dsh 端接入](../entities/dsh.md)、决策见 [安装器新增 dsh 端与 MCP 注册类型](installer-dsh-and-mcp-type.md)。

**后果**：Qoder 端首次会话后需重启 Qoder 才加载 MCP 配置（注入文案已提示）；`.gitignore` 新增 `.qoder/`；`rules/AGENTS.md` 9.1 与 README 的 Qoder 段同步说明例外；旧版安装器写进 `~/.qoder-cn/settings.json` 的 `mcpServers.qmd` 属无效遗留，需用户手动删除（安装器不自动改用户配置）。

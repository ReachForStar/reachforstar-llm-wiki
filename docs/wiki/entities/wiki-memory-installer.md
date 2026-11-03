---
title: wiki-memory 安装器（hooks 与 qmd MCP）
type: entity
tags: [安装, 安装器, hooks, mcp, wiki-memory]
created: 2026-11-03
updated: 2026-11-03
sources: [bin/install.mjs, hooks/wiki-memory/README.md]
status: active
---

# wiki-memory 安装器（hooks 与 qmd MCP）

## 职责

把 wiki-memory hook 与 qmd MCP 装进 pi / Claude Code / Codex / OpenCode / Qoder CLI 的配置根，并保持幂等。**不负责知识库规则文件**：`rules/AGENTS.md` 由使用者自己复制为项目根 `AGENTS.md`（整体替换），安装器不写规则。

## 关键文件与接口

- 入口：`bin/install.mjs`（`node bin/install.mjs`）
- 参数：`--agent pi|claude|codex|opencode|qoder|all`、`--type hooks|mcp|all`、`--dry-run`、`--yes`、`--no-backup`、`--list`、`--help`
- 环境变量：`MCP_CLI_CLAUDE` / `MCP_CLI_CODEX` 指定客户端 CLI 绝对路径；`XDG_CONFIG_HOME` 决定 OpenCode 配置根；`QODER_CONFIG_DIR` 决定 Qoder 配置根
- 行为契约：
  - 目标文件内容与包内文件相同则不动；不同才覆盖，覆盖前备份为 `<文件>.bak-<时间戳>`
  - 合并 JSON 配置时保留用户其他字段，只在 `hooks.SessionStart` 追加或修正本 hook 的 `timeout: 40`
  - 重复执行不产生新备份、不改写配置（幂等）
  - `--dry-run` 只打印将执行的动作，不写任何文件

## 各端落点

| 端 | hooks | qmd MCP |
| --- | --- | --- |
| pi | `<配置根>/extensions/wiki-memory.ts` | 合并 `<配置根>/mcp.json` 的 `mcpServers.qmd` |
| Claude Code | `~/.claude/settings.json` 的 `hooks.SessionStart` + `~/.wiki-memory/wiki-memory-hook.mjs` | `claude mcp add --scope user qmd -- qmd mcp` |
| Codex | `~/.codex/hooks.json` 的 `hooks.SessionStart` + 同一脚本 | `codex mcp add qmd -- qmd mcp` |
| OpenCode | `<配置根>/plugins/reachforstar-wiki-memory.js`（另装共享脚本） | 桥接插件运行时注入 `mcp.qmd` |
| Qoder CLI | `<配置根>/settings.json` 的 `hooks.SessionStart` + 同一脚本 | hook 在会话启动写项目级 `<项目根>/.qoder/.mcp.json` |

Claude Code / Codex 的 MCP 交给各自 CLI 注册，避免手写各家 schema；CLI 缺失只提示手动命令，不阻断安装。

## 上下游依赖

- 上游：[wiki-memory hook](wiki-memory-hook.md) 的三个文件（`wiki-memory.ts`、`wiki-memory-hook.mjs`、`reachforstar-wiki-memory.js`）与 `snippets/` 配置示例
- 下游：各端配置根与 `~/.wiki-memory/`；安装完成后由 hook 在会话开始建库、注入导航、准备 qmd
- 分工：安装器写静态配置；Qoder 项目级 `.qoder/.mcp.json` 只在会话启动由 hook 运行时写入，安装器不写

## 待确认

- 无

## 重要变更记录

- 2026-11-03 新建：此前仓库只有手工安装（复制文件 + 合并 `snippets/`），按「规则自己替换、hooks 用安装器」新增只装 hooks 与 MCP 的 `bin/install.mjs` 与 `test/install.test.mjs`。
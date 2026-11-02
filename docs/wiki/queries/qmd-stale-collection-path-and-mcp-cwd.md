---
title: qmd 检索与 MCP 双失效：集合遗留 Windows 路径 + Qoder MCP 子进程工作目录
type: query
tags: [qmd, MCP, 路径, 迁移, Qoder]
created: 2026-10-07
updated: 2026-10-07
sources: []
status: active
---

# qmd 检索与 MCP 双失效：集合遗留路径 + MCP 工作目录

## 问题

本仓库从 Windows 迁到 Linux 后，qmd 两条检索链路同时失效，且都不报错：

1. shell 侧：`qmd update` 每次报 `✓ All collections updated.`，但 `qmd status` 是 `Total: 0 files indexed`、
   1422 条向量全成孤儿；`qmd search` 任意关键词无结果，而 `rg -n docs/wiki` 能命中——文件在，只有索引链路断了。
2. MCP 侧：`mcp__qmd__status` 恒返回 `totalDocuments: 0`，`collections: []`，原生检索工具形同虚设。
3. [wiki-memory hook](../entities/wiki-memory-hook.md) 会话注入报「qmd 状态：本次刷新失败」。

## 根因

**根因一：`.qmd/index.yml` 的集合 path 是迁移前的绝对路径，qmd 对遍历不到的路径静默跳过。**
`.qmd/` 被 `.gitignore` 忽略（本地生成物），仓库搬家不会带任何提示，本项目残留 4 个失效集合：

```yaml
D:\file\skill-market\docs\wiki:  path: D:\file\skill-market\docs\wiki   # 键即路径的历史写法
wiki:    path: F:\项目\skill-market\docs\wiki
project: path: F:\项目\skill-market
```

hook 的失败提示来自这条链的下一环：它按 path 判断「集合不存在」→ 执行 `collection add docs/wiki --name wiki`
→ qmd 因**同名集合已存在**而拒绝（`Collection 'wiki' already exists.`）→ `ensureQmd` 返回 failed。
即旧绑定既没被摘除，新绑定又加不上。

**根因二：qmd 只在「进程工作目录位于项目内」时才发现项目索引，而 Qoder 的 MCP 子进程工作目录固定是用户主目录。**
`@tobilu/qmd` 的 `dist/collections.js:78 findLocalConfigPath()` 从 `process.cwd()` 逐级上溯找 `.qmd/index.yml`，
找不到就回落到全局 `~/.config/qmd/index.yml`（本机内容 `collections: {}`）。
实测运行中的 MCP 进程（`readlink /proc/<pid>/cwd`）：`cwd=/home/asus`，环境变量只有 `HOME`/`LANG`/`PATH`，
即 Qoder 既不把工作区传给子进程，也不给任何可推断项目的变量。

## 解法

本项目立即修复（`.qmd/index.yml` 已先备份到 `tmp/`）：

```bash
qmd collection remove 'D:\file\skill-market\docs\wiki'   # 逐个摘除失效绑定
qmd collection remove wiki && qmd collection remove project
qmd collection add docs/wiki --name wiki && qmd context add qmd://wiki "项目知识库（LLM Wiki）：…"
qmd collection add . --name project
qmd update          # wiki 46 文件 + project 83 文件
qmd embed && qmd cleanup   # 349 条向量，孤儿归零
```

代码层三处修复（见 [wiki-memory hook](../entities/wiki-memory-hook.md)、[installer](../entities/installer.md)）：

1. `dropStaleCollections()`：解析 `index.yml` 的集合，path 在本机不存在、或同名集合指向别处时先
   `collection remove`，再走原有的 add 分支——迁移后下次会话自动重绑。
2. `qmd update` 的绿灯不再作为就绪判据：绑定发生过变化时追加一次 `qmd status`，
   `Total: 0 files indexed` 直接报 `state: "empty"`，注入文案改为提示核对 path。
3. `ensureQoderMcp()`：Qoder 会话在 `<项目根>/.qoder/.mcp.json` 写
   `{"mcpServers":{"qmd":{"command":"qmd","args":["mcp"],"cwd":"<项目根>","env":{}}}}`，
   只增改 qmd 条目、保留项目既有配置；`.qoder/` 同 `.qmd/` 一起加入 `.gitignore`。

## 各端 MCP 子进程工作目录实测

| 端 | stdio MCP 的 cwd | 结论 |
|---|---|---|
| pi | 启动时 `process.cwd()`（项目根），`mcp.json` 条目可用 `cwd` 覆盖 | 用户级注册即可发现项目 `.qmd`，无需改动 |
| Claude Code | 继承父进程 cwd（项目根），另注入 `CLAUDE_PROJECT_DIR` | 同上 |
| OpenCode | 未设 `cwd` 时继承父进程 cwd（项目根） | 同上（MCP 由 wiki-memory 插件运行时注入） |
| Qoder 桌面/CLI | **`/home/asus`（实测 `/proc/<pid>/cwd`），env 只有 HOME/LANG/PATH** | 用户级注册恒为 0 篇，必须项目级带 `cwd` |

## 走过的弯路（结论以实测为准）

**`env: { INDEX_PATH: "<项目根>/.qmd/index.sqlite" }` 单独无效**。qmd 只在 `dist/store.js:510` 用它覆盖 DB 路径，
集合定义仍来自 yaml：cwd 在 HOME 时读到的还是全局空配置。实测三条命令同时失败——
`qmd status` 报 `Total: 0 files indexed`（尽管文件就在项目 `.qmd/`）、`qmd search` 无结果、
`qmd get docs/wiki/entities/qmd.md --full` 报 `Document not found`。
必须让集合可见：要么 cwd 落进项目（`cwd` 字段 / 从项目目录启动），要么 `QMD_CONFIG_DIR` 与 `INDEX_PATH` 成对指向 `.qmd/`。
成对方案实测可用（`qmd status` 报 129 文件 / 2 集合），但它把某一台机器的绝对路径写死进配置，
正是本次要修的失效类型，故最终选项目级 `cwd`。

探针脚本形态：`tmp/probe-qmd-mcp.mjs` 用 stdio JSON-RPC 直接 `initialize` + `tools/call status`，
三种启动方式各跑一次，避免靠猜。

## 涉及模块

`hooks/wiki-memory/wiki-memory-hook.mjs`、`hooks/wiki-memory/wiki-memory.ts`、`bin/install.mjs`、
`.qmd/index.yml`、`.gitignore`、`rules/AGENTS.md` 9.1。

## 复发预防

- 仓库换机器/换盘符后，除 Docker 挂载外要检查 `.qmd/index.yml` 的 `path`；hook 现已自动重绑，无需手工。
- 验收 qmd 只看 `qmd status` 的 `Total: N files indexed`（应等于 docs/wiki 页面数 + project 集合 md 数），不看 `update` 文案。
- 判定 MCP 是否真能用，看 `mcp__qmd__status` 的 `totalDocuments`，不是工具是否出现在列表里。
- Qoder 改完 MCP 配置要重启进程才生效；`git clone` 到新机器后首次会话由 hook 建立 `.qoder/.mcp.json`。

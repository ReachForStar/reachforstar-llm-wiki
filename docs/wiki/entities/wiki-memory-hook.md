---
title: wiki-memory hook（知识库自动注入）
type: entity
tags: [hook, 知识库, 上下文注入, qmd, pi, claude-code, codex, qoder]
created: 2026-09-15
updated: 2026-10-12
sources: []
status: active
---

# wiki-memory hook（知识库自动注入）

## 职责

解决「wiki 规则形同虚设」：会话开始时自动建好知识库骨架、注入「目录树 + 最近记录 + 检索命令」（**不注入正文**），并把 qmd 准备到可用（缺失时后台自动安装），让沉淀的知识按需可检索。

- 关键文件：`hooks/wiki-memory/wiki-memory.ts`（pi 扩展）、`hooks/wiki-memory/wiki-memory-hook.mjs`（Claude Code / Codex / Qoder SessionStart 脚本，Qoder 与 Claude Code 同构，见 [installer](installer.md)）、`hooks/wiki-memory/reachforstar-wiki-memory.js`（OpenCode 桥接插件，spawn 复用 .mjs 并在运行时注入 `mcp.qmd`）、`hooks/wiki-memory/snippets/`（两端 hook 配置示例）、`hooks/wiki-memory/README.md`。
- 分发：在 `bin/install.mjs` 顶部 `HOOKS` 表登记（`piExtension` + `script` + `events: { SessionStart: "" }`），安装到 pi `extensions/` 或 `~/.wiki-memory/`。

## 行为

| 时机 | 行为 |
| --- | --- |
| session_start | 从 cwd 向上查找 `docs/wiki/index.md`；未命中且当前处于带项目标记的项目根时，直接创建知识库骨架（不耗 token、已存在则跳过、不覆盖） |
| session_start | `ensureQmd`：`qmd status` 探活（**缺失则后台自动安装** `npm install -g @tobilu/qmd`，返回 `installing`）→ 无 `<root>/.qmd` 则 `qmd init`（生成索引文件）→ **摘除失效集合绑定**（`dropStaleCollections`，见关键设计 12）→ `collection add docs/wiki --name wiki` + `context add qmd://wiki` → `collection add . --name project` → `qmd update` → **Qoder 会话写项目级 `.qoder/.mcp.json`**（`ensureQoderMcp`，见关键设计 13）→ **后台触发 `qmd embed`** 生成向量索引文件（机制见关键设计 7）；**空库（0 页）同样建索引与集合**，空库注入附一行 qmd 状态 |
| before_agent_start | 本会话首轮注入一条 `customType: wiki-memory` 的持久消息（`display: false`）：**目录树**（分类 + 每页路径与标题，≤60 条）+ `log.md` 尾部 5 条 + 检索命令与 qmd 状态；不注入 index.md 正文与页面内容；空库注入里程碑沉淀与收尾整合提示 |

注入内容与「动手前查 / 过程中写」两条要求，对应 [AGENTS 规则](../../../rules/AGENTS.md) 第 11.0–11.2 章（规则条款本身不再随注入重复，避免与规则文件分叉）。

## 关键设计

1. **注入导航而非正文**：整份索引与页面正文会把上下文吃满；只给「路径 + 标题」清单，正文用 qmd/`read` 按需取（索引上限 60 条，超出部分靠检索定位）。被动规则（“记得去读 index.md”）在长上下文下会被跳过，而目录树与检索命令是零成本可用的。
2. **项目发现靠向上查找**：hook 在 cwd 下运行，天然 project-aware；`docs/wiki/index.md` 即知识库标记，嵌套子目录 cwd 也能命中项目根。
3. **qmd 自动就绪**：`init` / `collection add` / `update` 全为本地离线操作，不触发模型下载；`qmd search`（BM25）立即可用；`qmd embed`（向量索引文件）也在会话开始由 hook **后台触发**（机制见关键设计 7），注入文案如实标注向量生成状态。
4. **集合精确匹配**：判断配置中是否已有本项目集合时，按 `path:` 行/键做规范化全路径比对（`hasWikiCollection`），不用子串匹配——`tmp/q2/docs/wiki` 这类嵌套路径也含 `docs/wiki`，会误判为已配置。
5. **降级不阻塞**：所有 qmd 调用带超时（8–30s）并吞掉异常，失败状态如实写进摘要并给出 `rg -n "<关键词>" docs/wiki` 回退；`WIKI_MEMORY_QMD=0` 可整体关闭自动索引。
6. **建库要克制**：只在带项目标记（`.git`、`package.json` 等）的项目根建骨架，排除 home；已有 `index.md` 一律不覆盖；`WIKI_MEMORY_SCAFFOLD=0` 可关闭。骨架只建一次且不注入长文本，因此不占 token。
7. **qmd 自动安装是非阻塞的**：后台 detached 执行安装命令并写 `~/.wiki-memory/qmd-install.json` 标记，6 小时内不重复触发；本次会话用 `rg` 回退，下次会话自动就绪。`WIKI_MEMORY_INSTALL_QMD=0` 关闭，`QMD_INSTALL_CMD` 换命令。向量生成同理：`triggerQmdEmbed` 后台 detached 执行 `qmd embed`，标记 `~/.wiki-memory/qmd-embed.json` **按项目分 key**（`{roots: {"<项目根>": {lastAttempt, cmd}}}`），按项目 1 小时冷却；`qmd status` 输出里 pending>0（上次没跑完，如会话关闭连带子进程被杀）时冷却内也重新触发，`WIKI_MEMORY_EMBED=0` 关闭。排查过程见 [queries/qmd-embed-not-running.md](../queries/qmd-embed-not-running.md)。
8. **一次性注入**：`before_agent_start` 用 `injected` 标志保证每会话只注入一次；pi 的 runner 会把各扩展的 `before_agent_start` 消息依次 `push`，因此与 tmp-guard 的注入互不覆盖。
9. **扩展只在进程启动时加载**：新增/更新 `~/.pi/agent/extensions/*.ts` 后，运行中的 pi 进程不会自动加载，需在该会话执行 `/reload`（触发 `session_start reason:"reload"`）或重启 pi；旧会话上下文里的历史注入消息会重放，不能作为“当前生效”的证据。见 [排查记录](../queries/wiki-memory-pi-not-injecting.md)。
10. **qmd 的 PWD 显式固定**：qmd 的 `getPwd()` 优先取 PWD 环境变量而非进程 cwd，git-bash/MSYS 环境下 PWD 可能是 MSYS 风格或陈旧目录，会导致索引建错位置（见 [queries/windows-shell-pitfalls.md](../queries/windows-shell-pitfalls.md) 问题三）。因此所有 qmd 子进程（`runQmd` / `triggerQmdEmbed`）显式传 `env: { ...process.env, PWD: cwd }`；pi 扩展因此改用异步 `spawn` 而非 `pi.exec`（`pi.exec` 的 `ExecOptions` 只有 signal/timeout/cwd，没有 env）。
11. **集合注册 = `docs/wiki` + 全项目 `project`**：`qmd get` 的相对路径按**集合根**解析，`docs/wiki/...`（项目根视角）只在有全项目集合的项目可解析。2026-09-18 起 `ensureQmd` 追加注册全项目集合（幂等、best-effort）；注入示例与 AGENTS.md 用目录树形态（集合根相对，如 `queries/xxx.md`），任何环境通用。详见 [queries/qmd-get-path-resolution.md](../queries/qmd-get-path-resolution.md)。
12. **失效集合自动重绑，且不把 `qmd update` 的绿灯当作就绪**：仓库换机器/换盘符后 `.qmd/index.yml` 里的集合 `path` 会指向不存在的位置，qmd 静默跳过（`update` 仍报 All collections updated，`status` 却是 0 篇），而 hook 旧逻辑按 path 判定「集合缺失」去 `collection add`，又因**同名集合已存在**被拒→ 整体 failed。`dropStaleCollections()` 解析 collections 段，path 本机不存在、或同名集合指向别处（路径规范化后比对：统一分隔符、去引号与末尾斜杠、忽略大小写）时先 `collection remove` 再重注册。绑定发生过变化（新建库或重绑）时追加一次 `qmd status`，`Total: 0 files indexed` 直接返回 `state: "empty"`，注入文案如实提示核对 path，而不是「刷新失败」。`parseTotal()` 解析不到数字返回 -1（未知），未知不判为 0、不报失败。
13. **Qoder 会话写项目级 MCP 注册**：qmd 靠进程 cwd 上溯找 `.qmd/index.yml`，而 Qoder 的 MCP 子进程 cwd 固定是 HOME、env 只有 `HOME`/`LANG`/`PATH`（实测 `/proc/<pid>/cwd`），用户级注册永远读到空的全局配置。`ensureQoderMcp()` 在 `<项目根>/.qoder/.mcp.json` 写 `mcpServers.qmd = {command:"qmd",args:["mcp"],cwd:"<项目根>",env:{}}`：仅在检测到 QODER 开头环境变量、或该文件已存在时写（非 Qoder 会话不新建 `.qoder/` 目录）；JSON 解析失败、`command` 不是 qmd（用户自配）时不覆盖只标注状态；cwd 已正确则不动（幂等，二次运行文件字节不变）；写入需重启 Qoder 生效，注入文案据此提示。`WIKI_MEMORY_QODER_MCP=0` 关闭。`.qoder/` 与 `.qmd/` 同为本地生成物入 `.gitignore`（含本机绝对路径）。排查与各类实测见 [queries/qmd-stale-collection-path-and-mcp-cwd.md](../queries/qmd-stale-collection-path-and-mcp-cwd.md)。

## 上下游依赖

- 上游：项目 `docs/wiki/`（无则不工作）、可选 `qmd` CLI（未装则降级 `rg`）。
- 下游：pi `~/.pi/agent/extensions/wiki-memory.ts`；Claude Code / Qoder `settings.json` 的 SessionStart、Codex `hooks.json`；OpenCode `plugins/reachforstar-wiki-memory.js`；各项目 `<root>/.qmd/`（本地索引）与 `<root>/.qoder/.mcp.json`（Qoder 项目级 MCP 注册，含本机绝对路径）——均建议 gitignore。

## 重要变更记录

- 2026-10-12：空库提示改为逻辑里程碑完成后统一结构化沉淀，任务收尾关联条目、补总览和分类，见[任务收尾决策](../decisions/milestone-wiki-and-task-closure.md)。共享脚本空库实际注入测试通过，pi 扩展通过真实加载器加载。

- 2026-10-07 修复迁移后「检索与 MCP 双失效」：新增 `dropStaleCollections()`（集合 path 失效或同名集合指向别处时先 remove 再重注册）、`parseTotal()` + `state: "empty"`（绑定变化后复核 `qmd status`，不再把 `qmd update` 绿灯当就绪）、`ensureQoderMcp()`（Qoder 会话写项目级 `.qoder/.mcp.json`，条目带 `cwd`，幂等且不覆盖用户配置；`WIKI_MEMORY_QODER_MCP=0` 关闭）；注入新增 qmd MCP 状态行。.mjs 与 pi 端 .ts 同步，OpenCode 桥接插件经 spawn 复用自动跟随。新增 `test/wiki-memory.test.mjs`（失效重绑后 `qmd status` 真有条数、Qoder 写入与二次不动、非 Qoder 不建目录），全项目实测索引 129 篇 / 349 向量、`search`/`get`/`query` 命中。见 [queries/qmd-stale-collection-path-and-mcp-cwd.md](../queries/qmd-stale-collection-path-and-mcp-cwd.md)。
- 2026-09-15 新增：三端实现 + 安装器登记。实测通过：pi 扩展（esbuild 打包后注入索引、二次调用不重复注入）；.mjs（自动 init/collection/update、`qmd search` 命中 wiki 页面、子目录 cwd 正确上溯、无 wiki 项目零输出、`WIKI_MEMORY_QMD=0` 降级）；TS 类型检查无错误。
- 2026-09-15 扩充：新增项目根自动建库（幂等、不覆盖、可关；实测 11 项断言含非项目根不建、已有库不动、空库短提示），并优化项目标记缺失时的静默行为。
- 2026-09-15 改造：注入由「index.md 全文」改为「目录树 + 最近记录 + 检索命令」，正文按需检索；新增 qmd 后台自动安装（含冷却与开关）与集合描述（`context add`）。实测 17 项断言（导航内容与长度、缺 qmd 触发安装与冷却、关闭安装、建库）全通过。
- 2026-09-15 修正沉淀时机：注入文本由「收尾时写回」改为「**过程中即沉淀**（每完成一项 / 每验证一个结论就写回，收尾只核对补漏）」，与 `rules/AGENTS.md` 1.1 / 2.11 / 8.1 / 11 章及 safe-guard 提醒文案保持一致；同时修正本文档关键设计条目重号（两个 6）。
- 2026-09-15 检索优先级：注入的检索提示改为「**优先 qmd**（`qmd search` / `query`），`rg` 仅作回退与安装中/关闭时的降级」，与 `rules/AGENTS.md` 8.2 / 9.1 一致；此前部署把 `rg` 排在前面，易被当成默认手段。
- 2026-09-15 检索优先级扩围：回退面由仅 `rg` 扩为 `grep`/`rg`——注入文案、`rules/AGENTS.md`（8.2 优先级链 / 9.1 定位与原生工具行 / 9.3 全文检索行）统一为「查找 wiki 内容一律先 qmd，`grep` 与 `rg` 均仅作回退」；三端已安装规则副本与 pi 扩展同步更新。
- 2026-09-15 排查「不生效」：根因为长会话 pi 进程未加载 17:55/18:58 更新后的扩展文件（扩展只在进程启动时加载）；新进程实测全路径正常（C:/D 盘、ASCII/中文目录名、建库+注入均验证）。解法：运行中会话 `/reload` 或重启。见 [queries/wiki-memory-pi-not-injecting.md](../queries/wiki-memory-pi-not-injecting.md)。
- 2026-09-16 会话开始自动生成向量索引：`ensureQmd` 在 `update` 成功后后台触发 `qmd embed`（生成 `.qmd` 向量索引文件，首次下载本地模型；1 小时冷却 + `WIKI_MEMORY_EMBED=0` 开关），`retrievalHint` 增加向量状态行；pi 扩展与 .mjs 两端同步。配合 llm-wiki 方案完善（目标文档类型 markdown + anydoc 转换，见 [decisions/llm-wiki-markdown-anydoc.md](../decisions/llm-wiki-markdown-anydoc.md)）同步更新 `rules/AGENTS.md`（8.0/8.1/9.1/9.7）。
- 2026-09-16 修复 qmd embed「新会话不触发」：冷却标记改**按项目**（roots 映射，旧格式兼容覆盖）；`ensureQmd` 解析 probe 输出的 pending 数，pending>0 时冷却内也重新触发；注入文案改诚实（「本次已触发 / 已就绪」）。四场景实测全过，见 [queries/qmd-embed-not-running.md](../queries/qmd-embed-not-running.md)。
- 2026-09-16 修复 qmd PWD 误判：所有 qmd 子进程显式固定 `PWD=cwd`（MSYS 风格 PWD 会把索引建到 `D:\d\...` 鬼目录）；pi 端 `pi.exec` 改异步 `spawn`。实测：陈旧 PWD 场景下 .mjs 正确建索引并生成向量文件、pi -p 注入含向量状态行、tsc --strict 零错误。
- 2026-09-16 空库也自动建 qmd 索引：`ensureQmd` 由「仅 ≥1 页时执行」改为无条件执行——新 scaffold 的空库项目会话开始即生成 `.qmd` 索引 + docs/wiki 集合（此前要等首篇页面，期间手动 `qmd update` 会报 No collections found）；空库注入附一行 qmd 状态。
- 2026-09-16 排查「ppt 会话 hook 失效」：实为**设计行为非失效**——`D:/ppt` 无项目标记（无 .git/package.json 等）→ `isProjectRoot()` 不成立 → 不建库不注入；会话 jsonl 证实 tmp-guard/task-flow 均正常注入。结论：非项目目录（裸文件夹）的 wiki 注入是静默的，如需在裸目录用 wiki，先 `git init`（或补任一标记文件）再开新会话。
- 2026-09-16 行为验证（用户要求）：① 建库跳过——`ensureWikiSkeleton` 见 `docs/wiki/index.md` 存在即返回，实测同项目二次 start 的 index.md mtime 不变；子目录 cwd 会向上命中父项目 wiki（与 git 同构，不会重复建）。② qmd init——仅 `.qmd/index.yml` 缺失时执行，实测二次 start 的 index.yml mtime 不变；`qmd update` 每会话刷新。③ embed——新 0 页项目首会话即触发（marker 写入）；同项目 1h 内二次 start 不重写 marker、不重触发（冷却 recent）。附带修复：空库注入文案「首篇页面沉淀后下次会话开始自动索引」→「索引与集合已建立；首篇页面沉淀后下次会话自动纳入」（实测 0 页首会话即建 .qmd）。
- 2026-09-18 排查「纯 hook 项目 `qmd get` 报 Document not found」：文件在索引中但 `docs/wiki/...` 形态解析不到——`qmd get` 按集合根解析路径，hook 只注册 wiki 集合，该形态仅在有额外全项目集合的项目可用；实测集合根相对与 `qmd://` 形态可用、绝对路径不可用。见 [queries/qmd-get-path-resolution.md](../queries/qmd-get-path-resolution.md)。
- 2026-09-18 治本修复（方案 2+1，.mjs 与 .ts 两端同步）：`ensureQmd` 追加注册全项目集合 `project`（`collection add . --name project`，`hasProjectCollection` 按规范化全路径幂等判断、兼容历史路径键，best-effort 失败不阻断）；注入示例与 AGENTS.md（8.0/9.1，三端已安装副本同步）改为目录树形态 `qmd get entities/xxx.md --full`。实测：新项目双集合注册、两种路径形态均可 get、重跑不重复注册、本仓库（路径键旧集合）无变更。
- 2026-09-18 注入瘦身：删除注入消息尾部的「必须遵守（AGENTS.md 第 8 章）」段（与规则文件重复，属规则分叉源头，见 [规则文件瘦身与核心规则卡](../decisions/rules-slim-and-core-rules.md)）；注入只保留目录树 + log 尾部 + 检索命令。pi 扩展（`wiki-memory.ts`）与 claude/codex 共享脚本（`wiki-memory-hook.mjs`）两端同步，opencode 桥接插件经 spawn 复用 .mjs 自动跟随。

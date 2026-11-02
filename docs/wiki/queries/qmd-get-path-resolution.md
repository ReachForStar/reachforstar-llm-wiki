---
title: qmd get 报 Document not found：路径按集合根解析，docs/wiki/... 形态依赖全项目集合
type: query
tags: [qmd, 路径解析, 集合, 踩坑]
created: 2026-09-18
updated: 2026-09-18
sources: []
status: active
---

# qmd get 报 Document not found：路径按集合根解析

## 问题

在仅由 [wiki-memory hook](../entities/wiki-memory-hook.md) 初始化 qmd 的项目（如 `D:\deepseek-harness`）里，`qmd_get("docs/wiki/queries/xxx.md")` 报 `Document not found`，但文件在磁盘上存在、也在索引里。同一调用在本仓库（skill-market）却正常——路径形态本身没问题，是集合注册面不同。

## 根因

1. **`qmd get` 的路径是相对「集合根」解析的，不是相对项目根**：`qmd init`/`collection add` 注册的每个集合有自己的 `path:` 根（见 `<root>/.qmd/index.yml`），get 的相对路径按各集合根逐一匹配。
2. **hook 只注册一个集合**：`ensureQmd`（`hooks/wiki-memory/wiki-memory-hook.mjs:313`）只执行 `collection add docs/wiki --name wiki`，集合根是 `<项目根>/docs/wiki`。
3. 因此 `docs/wiki/queries/xxx.md` 在纯 hook 项目里要匹配 `<根>/docs/wiki/docs/wiki/queries/xxx.md`，必然落空 → `Document not found`。
4. **skill-market 之所以能用这种形态，是因为它额外有人工注册的全项目集合**（`.qmd/index.yml` 里 `D:\file\skill-market`，61 篇；hook 并不创建它）——`docs/wiki/...` 恰好等于该集合的相对路径。这是历史巧合，不是 hook 的保证。
5. 误导来源：`rules/AGENTS.md` 9.1 与 hook 注入文案（`wiki-memory-hook.mjs:334`）的示例都写成 `qmd get docs/wiki/entities/xxx.md`（项目根视角），在纯 hook 项目里直接不可用。

## 实测（2026-09-18，D:\deepseek-harness，仅 wiki 集合）

| 形态 | 结果 |
| --- | --- |
| `qmd get queries/a2a-v1.0.1-conformance-gaps.md`（集合根相对） | ✅ |
| `qmd get docs/wiki/queries/...`（项目根相对） | ❌ 纯 hook 项目；✅ 有全项目集合（2026-09-18 起 hook 自动注册） |
| `qmd get D:/deepseek-harness/docs/wiki/queries/...`（绝对路径） | ❌ Document not found（`qmd get` 不吃绝对路径） |
| `qmd get #<docid>` | ❌ CLI 报 usage（MCP `qmd_get` 工具声明接受 docid，CLI 不支持） |
| `qmd get qmd://wiki/queries/...`（集合 URL） | 取决于集合键：hook 注册（`--name wiki`）可用；历史路径键集合（如本仓库旧配置）不可用 |

`qmd ls wiki` 与 `qmd status` 均可确认文件已在索引中——报错只说明「路径没解析到集合」，不代表未索引；先 `qmd ls <集合>` 再判断是路径问题还是索引问题。

## 解法

**已实施（2026-09-18，方案 2+1）**：

1. **hook 追加注册全项目集合**（`ensureQmd`，.mjs 与 .ts 两端同步）：`collection add . --name project`，幂等（`hasProjectCollection` 按规范化全路径比对，兼容历史路径键写法）且 best-effort（失败不阻断，wiki 集合仍可用）。此后所有 hook 初始化的项目里 `qmd get docs/wiki/...` 均可解析。
2. **示例路径形态改为目录树形态**：hook 注入文案与 `rules/AGENTS.md`（8.0 / 9.1）的 get 示例统一为集合根相对（`qmd get entities/xxx.md --full`）——与注入目录树列出的路径一致，任何环境下通用；`docs/wiki/...` 作为可用备选保留说明。
3. **未采纳**：把默认示例改成 `qmd://` URL 形态——URL 取决于集合键（旧集合以路径为键时无 `qmd://wiki/` 可用），不稳定，仅作 `qmd ls` 输出参考。方案 3（向 qmd 上游提 issue）仍未提交。

## 涉及模块

- [wiki-memory hook](../entities/wiki-memory-hook.md)（`ensureQmd` 集合注册范围、注入示例文案；2026-09-18 已按解法 1、2 实施）
- `rules/AGENTS.md` 11.0 / 11.2 / 12.1（示例路径形态；2026-09-18 已同步更新，三端已安装副本一并同步）
- 同目录 [qmd 相关排查](windows-shell-pitfalls.md) 问题三（PWD 误判，索引建错位置）是另一类 qmd 坑，勿混淆：那个是索引不在项目里，本条是索引在、路径解析不到。

另注（双集合代价实测）：全项目集合与 wiki 集合会重复索引 wiki 页面（本仓库 91 = 61 + 30，30 ⊆ 61），但**查询结果按 docid（内容哈希）去重**——实测同一页命中两个集合只出现一次，故 UX 无重复项，代价仅是索引体积与 update/embed 计算略增。

## 复发预防

- 遇到 `Document not found` 先跑 `qmd ls`（或 `qmd collection list` 看集合根）区分「未索引」与「路径形态不符」，再决定是否 `qmd update`。
- 沉淀后立刻要用 qmd 检索时按 AGENTS.md 11.2 执行 `qmd update`；但 update 只解决「未索引」，解决不了本条的路径形态问题。

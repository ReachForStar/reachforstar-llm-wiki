---
title: wiki-memory pi 扩展“不生效”排查：长会话未加载新扩展
type: query
tags: [wiki-memory, pi, 扩展, 排查]
created: 2026-09-15
updated: 2026-09-15
sources: []
status: active
---

# wiki-memory pi 扩展“不生效”排查：长会话未加载新扩展

## 问题

用户反馈 LLM Wiki 规则（wiki-memory hook 的知识库导航注入）在命令行 pi 中“不生效了”：`D:\简历ppt` 项目的会话里既没有目录树注入，也没有自动建库（`docs/wiki/` 骨架缺失）；而同机其他项目、其他时段的会话有注入。

## 根因

**pi 只在进程启动时加载扩展；运行中的 pi 进程不会自动加载新增/更新过的扩展文件。**

用户的交互式 pi 会话自 14:47 起长期运行，而 `~/.pi/agent/extensions/wiki-memory.ts` 在 17:55 更新、18:58 重装（全量安装三端）。该进程启动时没有（或加载了旧版）wiki-memory 扩展，之后一直沿用——于是这个会话里 hook 完全不存在：不建库、不注入。同一时期新启动的 pi 进程加载到当前版本，一切正常。

## 排查过程（可复用）

1. **会话日志取证**（`~/.pi/agent/sessions/<项目>/*.jsonl`）：按 `customType":"wiki-memory"` 统计各会话注入次数并核对**时间戳**——发现所有注入都发生在扩展更新之前；注意 resume 的旧会话里历史注入消息会重放，不能当作“当前生效”的证据。
2. **文件状态**：`~/.pi/agent/extensions/` 与 `AGENTS.md` 存在同日 `.bak-<时间戳>` 备份 → 当天有安装器动作；`cmp` 确认当前文件与备份内容一致（排除“文件被改坏”）。
3. **隔离变量**：
   - `node --experimental-strip-types` 直接 import 扩展文件 → 语法/导出正常；
   - `pi -p --no-extensions -e <扩展文件>` 显式加载 → 正常建库注入（排除扩展代码本身问题）；
   - 干净沙箱 + `pi -p`（自动发现）→ 正常；对照 D 盘 ASCII/中文目录名、`--no-tools`（排除模型自行建库的干扰）→ 全部正常。
4. **锁定变量**：失败的是“旧进程 + 新扩展文件”的组合，而非某个目录/路径/编码问题。

## 解法

- **对已在运行的 pi 会话**：执行 `/reload`（重新加载扩展并触发 `session_start reason:"reload"`，hook 会重新建库/注入）；或直接重启 pi 进程。
- **新会话**：无需任何操作，启动即加载最新扩展。
- **流程改进**：安装器（`bin/install.mjs`）更新扩展后，提醒用户在所有运行中的 pi 会话执行 `/reload`（可作为后续迭代项）。

## 复发预防

- 判断“扩展是否生效”不要看当前会话上下文里的注入文本（可能是历史重放），以**会话 jsonl 中 custom message 的时间戳**为准。
- 扩展类改动落地后，先开一个**新** pi 进程验证，再在长会话里 `/reload`。
- 关联页面：[wiki-memory hook](../entities/wiki-memory-hook.md)

---
title: qmd embed 自动触发"没执行"排查：全局冷却标记 + 先写标记 + 文案失实
type: query
tags: [wiki-memory, qmd, embed, 排查]
created: 2026-09-16
updated: 2026-09-16
sources: [hooks/wiki-memory/wiki-memory.ts, hooks/wiki-memory/wiki-memory-hook.mjs]
status: active
---

# qmd embed 自动触发"没执行"排查

## 现象

新会话注入显示「向量索引：1 小时内已触发后台生成（可能仍在生成或已生成）」，但 `qmd status` 显示 10 篇文档 pending、无 qmd embed 进程在跑——"可能仍在生成或已生成"两种情况都不成立。

## 排查过程（关键取证）

1. **机制本身健康**（排除 spawn 故障）：
   - 普通 node 脚本里执行与 hook 完全相同的 `spawn("qmd embed", {detached, stdio:"ignore", shell, env PWD})` → 8 秒内完成 10 篇嵌入（117→208 向量）；
   - `pi -p` 中同样触发：子进程 t+2s 出现、4s 完成；**父进程（pi）退出后子进程存活并完成**（pi 退出时 pending=1，12s 后清零）。
2. **锁定时间线**：当前会话 jsonl 的注入消息时间戳 13:09:23，而冷却标记 `~/.wiki-memory/qmd-embed.json` 的 `lastAttempt`=13:08:42——**标记由 41 秒前的另一个 pi 进程写入**。本会话命中 `recent` 分支，不会触发。
3. **结构性缺陷**：冷却标记是**全局单文件**（所有项目共用一份），且**先写标记再 spawn**，标记只表达"触发过"，不表达"完成过"。

## 根因

三个因素叠加，把"一次性的子进程中断"放大成"1 小时内全机器不再触发"：

1. **全局冷却标记**：A 项目会话触发 embed 后，1 小时内 B 项目（或 A 项目下一次）的会话全部被挡；
2. **标记先于 spawn 写入**：即使 spawn 失败或子进程被杀（会话关闭连带控制台进程树），冷却照走；
3. **文案失实**：`recent` 说"可能仍在生成或已生成"，实际可能是"已死/没跑完"，误导排查方向。

## 解法（已实施，2026-09-16）

- 冷却标记改**按项目**存：`{"roots": {"<项目根>": {"lastAttempt", "cmd"}}}`（旧格式视为无记录，触发后覆盖，天然向后兼容）；
- `ensureQmd` 复用已有 `qmd status` 探活输出解析 **pending 数**：`pending > 0` 说明上次没跑完，**冷却内也重新触发**——完成状态以 qmd status 为准，而非"触发过"标记；
- 文案改诚实：`triggered` →「本次已触发后台生成（秒级到分钟级）；若下次会话仍未完成会自动重试」；`recent` →「已就绪（1 小时内生成过，当前无待嵌入文档）」。

实测四场景全过：无标记正常触发 / 冷却内 pending>0 重试（pending 清零）/ 冷却内 pending=0 不重复 / 标记里只有别的项目时本项目仍触发。

评审跟进（同日）：marker 改为**单次读取**（冷却判定与写回复用同一份，删除 `embedAttemptedRecently` 辅助）；`writeMarker` 改 **tmp+rename 原子写入**（防并发会话读到半截文件）；`pending` 判定收紧为 `=== 0`（`parsePending` 恒 ≥ 0）；类型断言收窄为局部变量。两端回归全过。

## 涉及模块

- [wiki-memory hook](../entities/wiki-memory-hook.md)（两端镜像：pi 扩展 + claude/codex .mjs）

## 复发预防

- 判"后台任务是否完成"不要信"触发过"标记，信任务自身的完成状态（qmd status 的 pending）；
- 全局单文件标记在多项目场景天然是坑——冷却/状态标记要么按项目分 key，要么存到项目内；
- 注入文案必须与实际状态严格对应，"可能 X 也可能 Y"的模糊文案会误导维护者。

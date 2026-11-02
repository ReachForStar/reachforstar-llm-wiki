# Wiki 操作日志

> 只追加、不修改历史。每条固定前缀，可用命令解析：
> `grep "^## \[" docs/wiki/log.md | tail -5`
> 前缀格式：`## [YYYY-MM-DD] <ingest|query|lint|init|chore> | <简述>`

## [2026-11-02] init | 从 skill-market 仓库拆分出 LLM Wiki 与 wiki-memory 知识库

- 三层骨架复制自 [ReachForStar/skills](https://github.com/ReachForStar/skills) 分支 `develop` 基线 commit `9589405`：`docs/raw/`（只读源层）、`docs/wiki/`（沉淀层）、`rules/AGENTS.md` 与 `rules/llm-wiki.md`（规则与原始参考）。
- 收录范围只取 LLM Wiki 模式与 wiki-memory hook 主题：wiki 页面 15 篇（entities 3 · concepts 3 · sources 1 · decisions 3 · queries 5），加 `hooks/wiki-memory/` 实现 6 个文件与 `test/wiki-memory.test.mjs`。
- 未复制的交叉引用目标见仓库 README「与源仓库的差异」；页面正文逐字节保持与源仓库一致，仅 `index.md` 与本日志按本仓库范围重写。
- 安装集成不在本仓库：源仓库用单体安装器 `bin/install.mjs` 分发六端 hook 配置，本仓库只提供 `hooks/wiki-memory/snippets/` 配置示例与手工安装步骤。

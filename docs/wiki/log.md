# Wiki 操作日志

> 只追加、不修改历史。每条固定前缀，可用命令解析：
> `grep "^## \[" docs/wiki/log.md | tail -5`
> 前缀格式：`## [YYYY-MM-DD] <ingest|query|lint|init|chore> | <简述>`

## [2026-11-02] init | 从 skill-market 仓库拆分出 LLM Wiki 与 wiki-memory 知识库

- 三层骨架复制自 [ReachForStar/skills](https://github.com/ReachForStar/skills) 分支 `develop` 基线 commit `9589405`：`docs/raw/`（只读源层）、`docs/wiki/`（沉淀层）、`rules/AGENTS.md` 与 `rules/llm-wiki.md`（规则与原始参考）。
- 收录范围只取 LLM Wiki 模式与 wiki-memory hook 主题：wiki 页面 15 篇（entities 3 · concepts 3 · sources 1 · decisions 3 · queries 5），加 `hooks/wiki-memory/` 实现 6 个文件与 `test/wiki-memory.test.mjs`。
- 未复制的交叉引用目标见仓库 README「与源仓库的差异」；页面正文逐字节保持与源仓库一致，仅 `index.md` 与本日志按本仓库范围重写。
- 安装集成不在本仓库：源仓库用单体安装器 `bin/install.mjs` 分发六端 hook 配置，本仓库只提供 `hooks/wiki-memory/snippets/` 配置示例与手工安装步骤。

## [2026-11-02] docs | rules/AGENTS.md 改为只收录知识库相关章节

- 整份复制改为摘取：收录源文件第 0（核心规则卡相关条款）、1.1、2（工作原则相关条款）、6（git 知识库条款）、8（知识沉淀特化）、9、10、11、12（qmd / glow / 命令行 / anydoc）、13、14（知识库相关步骤）章，其余通用工程规范不收录。
- 章节号沿用源文件编号，故章号不连续；未收录章节的引用按源仓库查看。
- 文件内相对链接按文件所在位置改写为 `../docs/...`（源文件同类链接按仓库根书写，解析不到）。
- 既有交叉引用仍然有效：`entities/qmd.md` 引 `9.1`、`entities/anydoc.md` 引 `12.5`、`entities/wiki-memory-hook.md` 引第 11.0–11.2 章均在收录范围内。
- 关联：`README.md` 的「目录结构」与「与源仓库的差异」已同步收录范围。

## [2026-11-02] chore | rules/AGENTS.md 改为通用独立规则并重新编号

- 开头改为权威声明与角色设定：本文件是知识库规则的唯一权威来源、全称最高优先级生效；你是 Code Agent，负责代码与项目维护并按第 7 章维护项目知识库；另附三层架构位置与 0–10 章导航。
- 按独立项目重新连续编号：章 0–10，小节 1.1 / 5.1 / 6.1 / 7.1–7.4 / 8.1–8.4，条款与收尾步骤均从 1 起；正文交叉引用（第 N 章、N.M、第 N 章第 N 条 / 步）随之改写，不再照抄源仓库章号。
- 第 10 章「任务收尾清单」补齐 4 步：知识整合、Wiki 校验、授权清理、提交与简报；此前 2.11 与第 10 章的「清理按第 14 章」指向本文件不存在的步骤。
- 10.1（现 6.1）的示范链接改为行内代码 `entities/auth-service.md`——原链接指向不存在的页面，且改写后不再是「相对当前文件的页面链接」形态；11.2（现 7.3）补 `qmd get` 示例与原生 MCP 参数名说明。
- 6.1 增「页面正文用简体中文，专业术语保留英文原名；同一概念使用同一术语」，YAML frontmatter 示例缩进进列表项，列表不再被打断；2.2 补清单路径模板 `tmp/task-<任务名>.md`。
- 改为通用规则：去掉指向本仓库页面的相对链接与来源、配套阅读、hook 未随附的说明；工具细节改为「见知识库 `entities/`、`queries/` 对应页面」表述，来源记在 `README.md`。
- 校验：章 / 小节 / 条款 / 步骤引用审计 0 处问题，文件内已无仓库相对链接；`marked` 渲染确认有序列表编号连续、frontmatter 示例嵌套正确。
- 关联：`README.md`「与源仓库的差异」改为说明重新编号后的收录范围与整理边界。

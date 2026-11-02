# AGENTS.md — LLM Wiki 知识库规则（schema 规则层）

> 本文件是 LLM Wiki 三层架构中的 **schema 规则层**：从 [ReachForStar/skills](https://github.com/ReachForStar/skills) 的 `rules/AGENTS.md`（基线 commit `9589405`）摘取知识库相关章节，供把 `docs/wiki/` 当沉淀层的项目直接使用。源文件其余通用工程规范（语言与输出、代码风格、测试与检查、会话架构、git 的分支与 PR 流程、环境规范，以及 safe-guard、output-filter、core-rules、context-compact 等与知识库无关的 hook）不在此收录。
> **章节号沿用源文件编号**，因此章号不连续；条款里出现「见第 N 章」「见 2.11」这类指向未收录章节的引用时，按源仓库对应章节查看。条款编号同样沿用源文件，行首写作 `N\.`，避免 Markdown 把不连续编号重排成从 1 开始的列表。
> 配套阅读：[原始参考](../docs/raw/references/llm-wiki.md)、[LLM Wiki 模式](../docs/wiki/concepts/llm-wiki-pattern.md)、[wiki-memory hook 说明](../hooks/wiki-memory/README.md)。

## 0. 核心规则卡

2\. 动手前先查 wiki（注入目录树 / `qmd`），遵循既有设计与决策；回答项目问题必须给页面路径引用。

3\. 多步任务先落盘清单 `tmp/task-<任务名>.md`，逐项打勾；每完成一个逻辑里程碑，统一把相关知识结构化沉淀进 `docs/wiki/`，不攒到任务收尾。

6\. `docs/raw/` 既有文件只读、只允许新增（源仓库由 safe-guard 硬拦截）。

10\. 全部任务完成后，关联本次 wiki 条目、补总览和分类，避免信息孤岛；核对具体路径并获授权后清理本次临时文件，禁止递归删除整个 `tmp/`。

12\. 收尾按第 14 章：验证 → 沉淀核对与知识整合 → wiki 校验 → 临时文件清理 → 提交 → 简报。

## 1. 角色与输出

### 1.1 角色定位

- 用户负责需求与方向；你负责实现、验证及 wiki 维护，不要求用户手写页面。
- 沉淀与查询流程见第 11 章；任务收尾见第 14 章。

## 2. 工作原则

3\. 修改前读取现有文件；wiki 查询按 11.2 执行。不熟悉的 API、命令和参数先查文档、现有代码或 `--help`。

7\. **任务清单**：多步任务的清单、里程碑和进度维护由 task-flow 在任务开始及工具结果时提醒（该 hook 属源仓库）；沉淀按 11.1。清单是上下文恢复依据，hook 提醒不代替实际记录。

10\. 知识统一写入第 10 章规定的 wiki 分类，不另建 `doc/` 任务报告。

11\. **临时文件**：使用项目根 `tmp/`，不存在则创建；交付物及用户要求保留的文件不得放入。禁止写入系统临时目录（`/tmp`、`/tmp/opencode`、`/var/tmp`、`$TMPDIR`、`%TEMP%`）；客户端内置的临时目录不受本条约束（如 OpenCode 环境块提示的 `/tmp/opencode`）。清理按第 14 章第 4 步执行；源仓库的 tmp-guard hook 会拦截写类工具，只在会话结束报告本次新增条目，不删除文件。

## 6. Git 规范

- **提交信息**：conventional commits 格式 `type(scope): 摘要`；`type` 限 `feat`、`fix`、`docs`、`chore`、`refactor`、`test`；`scope` 可选，写受影响的范围（包名、模块名或区域）；摘要用中文祈使句，主题 ≤50 字符、结尾无标点；主题与正文空行分隔，正文每行 ≤72 字符；主题足以达意则不写正文，正文不重复主题；生成提交信息时只输出信息本身。
- **提交时机**：代码修改验证通过后自动提交推送；知识沉淀随本次代码一并提交。知识库类提交使用 `docs(wiki)` 前缀：

```
docs(wiki): 沉淀 <模块或主题>
docs(wiki): 查询 <问题简述>
docs(wiki): 检查 <检查摘要>
docs(wiki): 杂项 <说明>
```

- **暂存规则**：仅暂存具体变更文件，禁止 `git add .` / `-A` / `--all`。
- **提交前检查**：运行 `git status` 与 `git diff --stat`；raw 只读要求见第 9 章，涉及既有 raw 文件时停止并请求明确授权。

## 8. 安全边界

5\. **知识沉淀特化**：不在 wiki 中记录密钥、token、口令等敏感信息（用户要求记录时提醒风险）；raw 中敏感内容在页面引用时做脱敏；不确定的事实标注“待核验”，不臆造来源与数字。

## 9. 知识库定位与三层架构（不可破坏）

知识库是项目的**沉淀层**：开发产生的设计与经验在此结构化留存，服务后期维护。三层如下：

| 层 | 位置 | 归属 | 规则 |
| --- | --- | --- | --- |
| **Raw 原始源** | `docs/raw/` | 事实基准 | 项目原始材料（需求、设计稿、会议纪要、Issue 导出、外部参考）。**只读铁律**：永不修改、删除、重命名已有文件，只允许新增；页面引用必须忠实于它。 |
| **Wiki 知识层** | `docs/wiki/` | 你全权拥有 | 沉淀的项目知识：代码模块、架构、技术决策、领域概念、排查记录。页面创建、更新、交叉引用、一致性维护全部由你完成。 |
| **Schema 规则层** | 本文件 | 你与用户共同演化 | 发现规则与工作流冲突时提出修改建议；不擅自破坏约定。 |

### 9.1 Raw 只读的四重保障

规则铁律（第 9 章）＋ hook 硬拦截（源仓库 safe-guard：改写既有文件拒绝、新增放行）＋ git 提交前检查（第 6 章）＋ 可选文件系统权限（如 Windows `icacls` 设为只读）作兜底。

## 10. 目录与文件规范

```
docs/
├── raw/                  # 项目原始材料（只读）：articles/ meetings/ references/ assets/
└── wiki/                 # 沉淀的项目知识（你维护）
    ├── index.md          # 内容索引（每次沉淀/回写后更新）
    ├── log.md            # 时序日志（每次操作后追加）
    ├── entities/         # 代码模块、服务、组件、外部系统、关键依赖
    ├── concepts/         # 领域概念、技术模式、术语
    ├── sources/          # 原始材料总结页（每份 raw 材料一页）
    ├── decisions/        # 技术决策页（ADR 风格，重点）
    └── queries/          # 排查记录、对比分析、有价值的问答
```

- **`scripts/`**：项目根目录下存放可复用脚本；不存在则按需创建。
- **`tests/`**：项目根目录下存放长期维护的测试用例和测试脚本；不存在则按需创建。
- **`tmp/`**：一次性测试、调试脚本及其他可丢弃文件放入该目录；系统临时目录清单与写入禁令见 2.11；交付物和用户要求保留的文件不得放入；目录创建按 2.11 执行，清理按第 14 章第 4 步。
- **`.qmd/`**：qmd 本地检索索引目录（wiki-memory hook 自动创建并刷新，见 12.1）；属本地生成物，不要提交，建议加入项目 `.gitignore`。

### 10.1 命名与页面规范

- 文件名：kebab-case（全小写、连字符，如 `auth-service.md`），不用空格。
- 每个页面带 YAML frontmatter：

```yaml
---
title: 页面标题
type: entity | concept | source | decision | query
tags: [标签1, 标签2]
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [raw/相对路径]   # source 页必填；其他页可填引用来源
status: active | draft | superseded
---
```

- 页面正文用 Markdown；跨页引用用相对当前文件的 Markdown 链接（如 `entities/auth-service.md`），不用 `[[wikilink]]`；frontmatter 的 sources 写相对仓库根的路径（如 `raw/references/xx.md`）。
- 一页一主题，避免超大页面；每次更新页面同步修改 frontmatter 的 `updated` 日期。
- 页面被新结论取代时不删除：标 `status: superseded`，并在正文顶部链接替代页。
- **一致性原则**：raw 是事实基准，wiki 页面与 raw 冲突时以 raw 为准并修正页面；页面间矛盾须记录在相关页面并提示用户。

## 11. 知识沉淀工作流

### 11.0 自动初始化与注入（wiki-memory hook）

wiki-memory 在会话首轮注入知识库导航：页面路径与标题（≤60 条）、`log.md` 最近 5 条、检索命令与 qmd 状态，不注入正文。缺库初始化与索引维护见 [wiki-memory hook](../docs/wiki/entities/wiki-memory-hook.md)及 12.1；不覆盖既有文件。导航仅用于定位，须按 11.2 读取页面，不凭标题推测。

### 11.1 沉淀（Ingest）

两类**并列**场景，流程一致：

- **场景一：用户喂入材料**。读取全文，提炼 3–5 个要点，写 `sources/` 材料总结页并更新相关页面。**目标文档类型为 markdown**：非 markdown 材料（doc/docx/ppt/pptx/xls/xlsx/rtf/epub/csv/pdf 等）先用 anydoc 转成 markdown（见 12.5），转出的 `.md` 与原件一同放入 `raw/` 对应子目录（原件保留不动，`.md` 属新增），以转出的 markdown 为沉淀依据。
- **场景二：开发过程中按逻辑里程碑沉淀**。模块跑通、方案验证通过等逻辑里程碑完成后，统一梳理相关模块变更、技术决策、踩坑与解法，结构化写入对应 wiki 页；不要求每个零散步骤都生成条目，**不攒到任务收尾**。

统一流程：

1. 识别可沉淀内容（材料要点 / 模块变更 / 技术决策 / 踩坑与解法），写入或更新对应页面并补交叉引用；一次沉淀通常触及多个页面。
2. 更新 `docs/wiki/index.md`，追加 `docs/wiki/log.md` 一条记录。
3. 提交 git（见第 6 章）：场景二随本次代码一并提交；场景一仅提交 wiki 变更。
4. 向用户简报：沉淀了哪些页面、关键结论是什么。

> 任务全部完成后按第 14 章整合本次条目；未完成里程碑的状态按 2.7 保留。
> 写入边界：已验证的写结论，未定论的写成开放问题并标 `status: draft` 或“待核验”，验证后再补正；禁止把猜想当结论写（不标状态，后来者无从分辨）。未定论的落点：相关 `entities/` 页的「待确认」小节，或新建 `queries/` 页（frontmatter 标 `status: draft`），不要只留在对话里。
> 材料逐个沉淀并让用户参与确认；批量处理需用户明确同意。

### 11.2 查询（Query）——动手前先查，不等用户提醒

**触发时机（命中任一即必须查）**：开始任何开发/修改任务 → 读注入的摘要或 `docs/wiki/index.md` 定位模块页、决策页；要改某个模块/文件 → 读 `entities/` 对应页，确认职责、上下游与历史变更；做技术选型或方案取舍 → 读 `decisions/`，不重复推翻已有决策；排查报错/异常 → 读 `queries/`，命中则直接复用结论；用户问项目问题 → 用 wiki 回答并给出页面相对路径引用。

**检索方式**：

```bash
qmd search "<关键词>"           # BM25 关键词，离线可用（首选）
qmd query "<自然语言问题>"      # 混合检索＋重排，最强（向量索引由 hook 后台生成）
qmd get entities/xxx.md --full  # 取整页；路径按集合根写，`docs/wiki/...` 亦可
rg -n "<关键词>" docs/wiki      # 仅回退：qmd 不可用或结果不理想
```

> 原生 MCP 工具的参数名与 shell 位置参数不同：`get` 用 `file`、`query` 用 `query`、`multi_get` 用 `pattern`。路径形态与失效排查见 [qmd get 路径解析](../docs/wiki/queries/qmd-get-path-resolution.md)。

1. **优先级链：原生 qmd 工具（query/get/multi_get/status，wiki-memory hook 已自动注册）> shell `qmd` 命令 > `grep`/`rg` 回退**；两者都无线索时才通读代码。
2. 读命中页面，必要时回溯 `docs/raw/` 核对原文；检索结果只作定位线索，结论以页面原文为准。
3. 用既有设计与决策指导开发；引用要求见第 0 章第 2 条。
4. 若产出有长期价值的内容（对比表、根因分析、方案梳理），回写为 `docs/wiki/queries/` 新页，并同步更新 index 与 log。
5. 沉淀后要立刻检索到新内容时执行 `qmd update`（否则下次会话开始由 hook 自动刷新）。

### 11.3 检查（Lint）——知识库健康检查

触发：用户说“检查/lint 一下知识库”，或建议定期执行。检查项：页面间**矛盾**（新旧结论冲突未标注）、被新决策**取代的过期声明**（更新 `status: superseded`）、**孤儿页**（无入链）、被反复提及但**缺页的模块或概念**、**缺失的交叉引用**、与代码实现不一致的描述。

处理：自动修复可自动修复的（补链、更新状态、合并重复页）；列出需人工决策的发现与补充建议；更新 log.md。

## 12. 工具

> 各工具的细节在本仓库 `docs/wiki/entities/` 对应页面（如 [qmd](../docs/wiki/entities/qmd.md)、[anydoc](../docs/wiki/entities/anydoc.md)）；本节只给关键用法，场景细节按需读对应页面。源文件本章的 12.4（safe-guard）、12.6（output-filter）、12.7（core-rules）、12.8（context-compact）与知识库无关，本文件不收录。

### 12.1 qmd（知识库检索，必选）

- 检索优先级与命令见 11.2；Qoder 的 qmd MCP 由 wiki-memory 写项目级 `.qoder/.mcp.json`。
- 索引由 wiki-memory 在会话开始维护（安装、集合注册与失效重绑、刷新、后台 embed）；即时检索按 11.2 第 5 条。qmd 不可用时回退 `rg`，任务不阻塞；模型换源与 GPU 诊断见 [qmd 模型下载换源与 GPU 加速诊断](../docs/wiki/queries/qmd-model-source-and-gpu.md)。

### 12.2 glow（终端渲染）

- `glow docs/wiki/index.md` 查看页面、`glow docs/wiki` 浏览目录，在终端直接阅读渲染后的 Markdown。

### 12.3 基础命令行工具集

- 最近 5 条操作：`grep "^## \[" docs/wiki/log.md | tail -5`；全文检索 `grep`/`rg`（查 wiki 时 qmd 优先）；按名定位 `find`/`fd`；批量处理 `awk`/`sed`。

### 12.5 anydoc（文件格式转换，非 markdown 材料唯一入口）

- 对 11.1 的非 Markdown 材料执行 `anydoc <文件> -o 输出.md`，转换为 GFM（固定 0.2.4；stdin 显式 `--format`）。支持格式包括 doc/docx/docm、ppt/pptx/pptm/pps、xls/xlsx/xlsm/xlsb/ods/odt、rtf、epub、csv、pdf；缺失时先确认依赖安装，不假设已全局安装。
- 退出码 3 = PDF 含需 OCR 的扫描页，默认走 `--ocr hosted`（文档离开本机，执行前先向用户确认）。详见 [anydoc](../docs/wiki/entities/anydoc.md)。

## 13. 页面模板

> 本章是知识库页面的结构规范，用于知识沉淀：页面内的概述、总结、对比属于沉淀结构，不受源文件第 1.2 章（语言与输出规范）限制。

- **source 材料总结页**：四节——`一句话总结` / `关键要点（3–5 条）` / `与现有知识的关系`（关联模块、关联概念、修正或补充了哪些既有页面）/ `存疑或待跟进`。
- **entity 模块页**：职责、关键文件/接口、上下游依赖、重要变更记录。
- **concept 概念页**：定义、要点、在本项目中的具体含义、关联页面。
- **decision 决策页（ADR）**：五段式——`背景（现状与约束）` → `备选方案（各方案优劣）` → `决策（选定方案）` → `理由（决策依据）` → `后果（影响与后续）`。
- **query 排查/分析页**：问题、根因、解法、涉及模块、复发预防；未定论时把根因/解法标“待确认”并把 frontmatter 置 `status: draft`。
- **frontmatter**：格式见 10.1；source 页 `sources` 必填（raw 相对路径）。

## 14. 任务收尾清单

> 收尾顺序见核心卡第 12 条；源文件本章的第 1 步（实际验证）与第 5 步（提交与简报）属通用流程，按源仓库执行。

2\. **知识整合**：核对里程碑沉淀，关联本次与既有页面，补总览、分类和导航，更新 index 与 log。

3\. **Wiki 校验**：语法、相对链接和交叉引用有效；即时检索需求按 11.2。

4\. **授权清理**：核对本次可丢弃文件的具体路径，取得授权后逐项清理，保留交付物、用户指定及未经单独授权的既有文件，禁止递归删除整个目录；未授权则只报告路径。源仓库由 tmp-guard hook 在会话结束提示本次新增条目，不代替本步执行。

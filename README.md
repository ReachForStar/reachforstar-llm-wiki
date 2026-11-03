# reachforstar-llm-wiki

LLM Wiki 知识库模式与 `wiki-memory` hook 的独立仓库：让 AI 编码助手在项目里持续沉淀结构化知识，并在会话开始时把「知识库在哪、怎么检索」直接送到眼前，而不是依赖 Agent 主动去读规则。

内容复制自 [ReachForStar/skills](https://github.com/ReachForStar/skills)（分支 `develop`，基线 commit `9589405`），只取 LLM Wiki 与 wiki-memory 这条线。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `hooks/wiki-memory/` | hook 实现：pi 扩展 `wiki-memory.ts`、Claude Code / Codex / Qoder 共享脚本 `wiki-memory-hook.mjs`、OpenCode 桥接插件 `reachforstar-wiki-memory.js`、`snippets/` 两端配置示例、[组件说明](hooks/wiki-memory/README.md) |
| `rules/llm-wiki.md` | LLM Wiki 模式原始参考文档（三层架构与操作方法） |
| `rules/AGENTS.md` | schema 规则层：摘取源仓库规则中与知识库相关的章节——三层架构、目录与页面规范、沉淀/查询/检查工作流、页面模板、qmd 与 anydoc 用法 |
| `docs/raw/references/llm-wiki.md` | raw 只读源层中的原始材料，内容与 `rules/llm-wiki.md` 相同 |
| `bin/install.mjs` | hooks 与 qmd MCP 安装器（规则文件由使用者自己复制替换） |
| `docs/wiki/` | 沉淀层：16 篇主题页面（15 篇复制 + 安装器页）+ [内容索引](docs/wiki/index.md) + [操作日志](docs/wiki/log.md) |
| `test/wiki-memory.test.mjs` | hook 的行为测试（失效集合重绑、Qoder 项目级 MCP 写入与幂等、非 Qoder 不建目录） |
| `test/install.test.mjs` | 安装器测试（五端落点、幂等、保留既有配置、dry-run 不写文件、pi MCP 合并） |

## 这套东西解决什么问题

`AGENTS.md` 写的「动手前先查 wiki、按里程碑沉淀」是被动规则：上下文一长、任务一急，Agent 就不再主动读 `docs/wiki/`，写下的知识无人消费，检索工具也闲置。`wiki-memory` 把它换成三件自动发生的事：

1. 会话开始：从 cwd 向上找 `docs/wiki/index.md`，未命中且当前是带项目标记的根目录时，直接建好知识库骨架（不耗 token，已存在则不动）。
2. 会话开始：把 qmd 准备到可用状态——缺失则后台自动安装，没有索引则 `init` + 注册集合并 `update`，并后台触发 `qmd embed` 生成向量索引。
3. 首轮对话：注入「目录树（页面路径 + 标题，上限 60 条）+ `log.md` 最近 5 条 + 检索命令 + qmd 状态」，正文一律按需检索，不进上下文。

三层架构与不变量见 [LLM Wiki 模式](docs/wiki/concepts/llm-wiki-pattern.md)，hook 的设计取舍见 [wiki-memory hook](docs/wiki/entities/wiki-memory-hook.md)。

## 安装

分两步：**规则文件自己复制替换**，**hooks 与 qmd MCP 交给本仓库的安装器**。

### 1. 规则文件（自己替换）

把 `rules/AGENTS.md` 复制为项目根 `AGENTS.md`；目标文件已有内容会被替换，先自行备份差异。`rules/llm-wiki.md` 是三层的原始参考文档，可选。

```bash
cp rules/AGENTS.md <项目根>/AGENTS.md
cp rules/llm-wiki.md <项目根>/docs/raw/references/llm-wiki.md   # 可选
```

### 2. hooks 与 qmd MCP（安装器）

依赖 Node.js ≥18；检索工具 [qmd](https://github.com/tobi/qmd) 需 Node ≥22，未安装时 hook 在会话开始后台执行 `npm install -g @tobilu/qmd`（`WIKI_MEMORY_INSTALL_QMD=0` 关闭），当次会话降级为 `rg` 检索。

```bash
node bin/install.mjs --list                                # 查看各端落点
node bin/install.mjs --dry-run                            # 预览将改动的文件
node bin/install.mjs --yes                                # 装 hooks + qmd MCP
node bin/install.mjs --agent pi,claude --type hooks --yes  # 只装指定端与内容
```

安装器只处理 hooks 与 MCP，不碰规则文件；覆盖前备份为 `<文件>.bak-<时间戳>`（`--no-backup` 关闭），重复执行幂等。

| 端 | hooks 落点 | qmd MCP |
| --- | --- | --- |
| pi | `~/.pi/agent/extensions/wiki-memory.ts` | 合并 `~/.pi/agent/mcp.json` 的 `mcpServers.qmd` |
| Claude Code | `~/.claude/settings.json` 的 `hooks.SessionStart`，脚本 `~/.wiki-memory/wiki-memory-hook.mjs` | `claude mcp add --scope user qmd -- qmd mcp` |
| Codex | `~/.codex/hooks.json` 的 `hooks.SessionStart`，脚本同上 | `codex mcp add qmd -- qmd mcp` |
| OpenCode | `<配置根>/plugins/reachforstar-wiki-memory.js`（配置根随 `XDG_CONFIG_HOME`） | 桥接插件运行时注入 `mcp.qmd`，不写配置 |
| Qoder CLI | `<配置根>/settings.json`（取 `$QODER_CONFIG_DIR`，否则 `~/.qoder-cn`、`~/.qoder`），脚本同上 | hook 在会话启动写项目级 `<项目根>/.qoder/.mcp.json` |

生效条件：pi 只在进程启动时加载扩展，运行中的会话执行 `/reload` 或重启；Codex 首次进入交互模式需确认信任 hook；Qoder CLI 只在会话启动时读 `settings.json`，需重启。Claude Code / Codex 的 MCP 用各自 CLI 注册，CLI 不在 PATH 时按输出提示手动执行，可用 `MCP_CLI_CLAUDE`、`MCP_CLI_CODEX` 指向绝对路径。

不使用安装器时：复制 `hooks/wiki-memory/` 下的对应文件（pi 用 `wiki-memory.ts`，OpenCode 用 `reachforstar-wiki-memory.js`，其余端用 `wiki-memory-hook.mjs`），再把 `snippets/claude-settings.json`、`snippets/codex-hooks.json` 的 `hooks` 合并进目标配置。

### 环境变量

开关一律在运行时从进程环境读取，安装器不写进任何配置文件（Qoder 项目级 `.qoder/.mcp.json` 里的 `env` 也是空对象）。长期生效用 shell 启动文件或系统环境变量注入；客户端若另有环境变量配置机制，按该端文档设置。

| 变量 | 作用 |
| --- | --- |
| `WIKI_MEMORY_QMD=0` | 关闭 qmd 全部自动化（安装、索引、刷新），只保留建库与导航注入 |
| `WIKI_MEMORY_INSTALL_QMD=0` | 只关闭自动安装 qmd，仍使用已安装的 qmd |
| `WIKI_MEMORY_EMBED=0` | 只关闭后台生成向量索引 |
| `WIKI_MEMORY_SCAFFOLD=0` | 关闭自动建库骨架 |
| `WIKI_MEMORY_QODER_MCP=0` | 关闭 Qoder 项目级 `.qoder/.mcp.json` 写入 |
| `QMD_INSTALL_CMD` | 覆盖安装命令（默认 `npm install -g @tobilu/qmd`） |

## 使用

在任意项目根放置 `docs/wiki/index.md`（或由 hook 自动创建），会话开始即得到知识库导航。检索按优先级：

```bash
qmd search "<关键词>"        # BM25 关键词，离线可用
qmd query "<自然语言问题>"   # 混合检索 + 重排
rg -n "<关键词>" docs/wiki   # qmd 不可用时的回退
```

本仓库自身就按该结构组织，可直接作为 wiki-memory 的知识库根使用。`.qmd/` 与 `.qoder/` 是本地生成物，已在 `.gitignore` 中。

## 测试

```bash
npm test    # node --test test/*.test.mjs
```

`test/wiki-memory.test.mjs` 会调用真实 `qmd` 做 init / collection / update，本机无 qmd 时自动跳过，不阻塞；`test/install.test.mjs` 在临时 HOME 下运行，不碰真实客户端配置。

## 与源仓库的差异

- **安装器只覆盖 hooks 与 MCP**：源仓库的单体 CLI `bin/install.mjs` 一次分发 skills、9 个 hook 目录、规则、MCP 与压缩配置到六端；本仓库的 `bin/install.mjs` 只装 wiki-memory hooks 与 qmd MCP，知识库规则文件由使用者自己复制替换。
- **wiki 页面是主题子集**：源仓库 `docs/wiki/` 有 59 篇内容页（另含 `index.md` 与 `log.md`），本仓库复制 15 页，另有本仓库自有的 [安装器页](docs/wiki/entities/wiki-memory-installer.md)。以下页面被复制页引用但未包含，链接在本仓库内不可解析，需要时回到源仓库查看：

  | 未包含页面 | 被哪些页面引用 |
  | --- | --- |
  | `entities/installer.md` | wiki-memory hook、qmd 检索与 MCP 双失效 |
  | `entities/safe-guard-hook.md` | 知识消费回路 |
  | `entities/task-flow-hook.md` | 知识消费回路 |
  | `entities/dsh.md` | qmd MCP 必选决策 |
  | `decisions/rules-slim-and-core-rules.md` | wiki-memory hook、qmd、anydoc |
  | `decisions/milestone-wiki-and-task-closure.md` | wiki-memory hook |
  | `decisions/danger-rules-hard-block.md` | qmd MCP 必选决策 |
  | `decisions/installer-dsh-and-mcp-type.md` | qmd MCP 必选决策 |
  | `queries/windows-shell-pitfalls.md` | wiki-memory hook、qmd get 路径解析 |

- **`rules/AGENTS.md` 只收录知识库相关章节，且已重新编号**：收录源文件第 0（核心规则卡相关条款）、1.1、2（工作原则相关条款）、6（git 的知识库相关条款）、8（知识沉淀特化）、9、10、11、12（qmd / glow / 命令行 / anydoc）、13、14（第 2–4 步）章，删去与知识库无关的通用工程规范（语言与输出、代码风格、测试与检查、会话架构、git 的分支与 PR 流程、环境规范，以及 safe-guard、output-filter、core-rules、context-compact 等 hook）。内容按本仓库重新连续编号（章 0–10、小节与条款亦连续）；开头写明本文件是知识库规则的唯一权威来源与角色。文件按通用规则写，不含指向本仓库页面的链接，工具细节按知识库 `entities/`、`queries/` 定位。
- **复制页内仍有指向源仓库的引用**：除上表 9 篇页面外，`entities/qmd.md` 与 `decisions/qmd-native-mcp-required.md` 引用了源仓库代码文件 `bin/mcp-install.mjs`（该链接写作 `../../bin/mcp-install.mjs`，在源仓库里相对路径也少写一层，已指向不存在的位置）。本仓库只有 `bin/install.mjs`，不含 `bin/mcp-install.mjs`，这类引用统一按源仓库处理。
- **内容快照，不与源仓库双向同步**：复制件在初始化提交（基线 commit `9589405`）时与源仓库逐字节一致；源仓库此后对 `docs/wiki/entities/wiki-memory-hook.md` 追加了本次拆分的变更记录（其中链接的 `decisions/llm-wiki-repo-split.md` 只存在于源仓库），本仓库未同步这类增量，需要最新内容时回源仓库取。

## 许可

MIT，见 [LICENSE](LICENSE)。

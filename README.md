# reachforstar-llm-wiki

LLM Wiki 知识库模式与 `wiki-memory` hook 的独立仓库：让 AI 编码助手在项目里持续沉淀结构化知识，并在会话开始时把「知识库在哪、怎么检索」直接送到眼前，而不是依赖 Agent 主动去读规则。

内容复制自 [ReachForStar/skills](https://github.com/ReachForStar/skills)（分支 `develop`，基线 commit `9589405`），只取 LLM Wiki 与 wiki-memory 这条线。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `hooks/wiki-memory/` | hook 实现：pi 扩展 `wiki-memory.ts`、Claude Code / Codex / Qoder 共享脚本 `wiki-memory-hook.mjs`、OpenCode 桥接插件 `reachforstar-wiki-memory.js`、`snippets/` 两端配置示例、[组件说明](hooks/wiki-memory/README.md) |
| `rules/llm-wiki.md` | LLM Wiki 模式原始参考文档（三层架构与操作方法） |
| `rules/AGENTS.md` | schema 规则层：知识库三层架构、沉淀/查询/检查工作流与页面模板在第 9–14 章 |
| `docs/raw/references/llm-wiki.md` | raw 只读源层中的原始材料，内容与 `rules/llm-wiki.md` 相同 |
| `docs/wiki/` | 沉淀层：15 篇主题页面 + [内容索引](docs/wiki/index.md) + [操作日志](docs/wiki/log.md) |
| `test/wiki-memory.test.mjs` | hook 的行为测试（失效集合重绑、Qoder 项目级 MCP 写入与幂等、非 Qoder 不建目录） |

## 这套东西解决什么问题

`AGENTS.md` 写的「动手前先查 wiki、按里程碑沉淀」是被动规则：上下文一长、任务一急，Agent 就不再主动读 `docs/wiki/`，写下的知识无人消费，检索工具也闲置。`wiki-memory` 把它换成三件自动发生的事：

1. 会话开始：从 cwd 向上找 `docs/wiki/index.md`，未命中且当前是带项目标记的根目录时，直接建好知识库骨架（不耗 token，已存在则不动）。
2. 会话开始：把 qmd 准备到可用状态——缺失则后台自动安装，没有索引则 `init` + 注册集合并 `update`，并后台触发 `qmd embed` 生成向量索引。
3. 首轮对话：注入「目录树（页面路径 + 标题，上限 60 条）+ `log.md` 最近 5 条 + 检索命令 + qmd 状态」，正文一律按需检索，不进上下文。

三层架构与不变量见 [LLM Wiki 模式](docs/wiki/concepts/llm-wiki-pattern.md)，hook 的设计取舍见 [wiki-memory hook](docs/wiki/entities/wiki-memory-hook.md)。

## 安装

依赖 Node.js；检索工具 [qmd](https://github.com/tobi/qmd) 需 Node ≥ 22，未安装时 hook 会后台执行 `npm install -g @tobilu/qmd`（`WIKI_MEMORY_INSTALL_QMD=0` 关闭），本次会话自动降级为 `rg` 检索。

```bash
# pi：扩展目录内文件名保持 wiki-memory.ts，由 pi 自带运行时加载
cp hooks/wiki-memory/wiki-memory.ts ~/.pi/agent/extensions/

# Claude Code / Codex / Qoder CLI：脚本目录 + 合并 SessionStart 配置
mkdir -p ~/.wiki-memory && cp hooks/wiki-memory/wiki-memory-hook.mjs ~/.wiki-memory/
# 把 hooks/wiki-memory/snippets/claude-settings.json 的 hooks 合并进 ~/.claude/settings.json
# 把 hooks/wiki-memory/snippets/codex-hooks.json 的 hooks 合并进 ~/.codex/hooks.json

# OpenCode：桥接插件
cp hooks/wiki-memory/reachforstar-wiki-memory.js ~/.config/opencode/plugins/
```

Codex 对 hook 有信任校验，首次进入交互模式需确认信任。各端配置文件路径与 Qoder 项目级 `.qoder/.mcp.json` 的写入细节见 [qmd 检索与 MCP 双失效排查](docs/wiki/queries/qmd-stale-collection-path-and-mcp-cwd.md)。

环境变量开关：

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

测试会调用真实 `qmd` 做 init / collection / update，本机无 qmd 时自动跳过，不阻塞。

## 与源仓库的差异

- **不含安装器**：源仓库用单体 CLI `bin/install.mjs` 一次分发 skills、9 个 hook 目录、规则与 MCP 到六端，其中 wiki-memory 只占一小段。抽出来会是无法运行的残件，因此本仓库只提供 `snippets/` 配置示例与上面的手工安装步骤。
- **wiki 页面是主题子集**：源仓库 `docs/wiki/` 有 59 篇内容页（另含 `index.md` 与 `log.md`），本仓库只取 15 页。以下页面被复制页引用但未包含，链接在本仓库内不可解析，需要时回到源仓库查看：

  | 未包含页面 | 被哪些页面引用 |
  | --- | --- |
  | `entities/installer.md` | wiki-memory hook、qmd 检索与 MCP 双失效 |
  | `entities/safe-guard-hook.md` | 知识消费回路、`rules/AGENTS.md` |
  | `entities/task-flow-hook.md` | 知识消费回路 |
  | `entities/dsh.md` | qmd MCP 必选决策 |
  | `decisions/rules-slim-and-core-rules.md` | wiki-memory hook、qmd、anydoc |
  | `decisions/milestone-wiki-and-task-closure.md` | wiki-memory hook |
  | `decisions/danger-rules-hard-block.md` | qmd MCP 必选决策 |
  | `decisions/installer-dsh-and-mcp-type.md` | qmd MCP 必选决策 |
  | `queries/windows-shell-pitfalls.md` | wiki-memory hook、qmd get 路径解析 |

- **`rules/AGENTS.md` 按原文完整复制**：第 9–14 章是本仓库主题（三层架构、沉淀/查询/检查流程、页面模板），其余章节（git 规范、代码风格、其他 hook）属于源仓库项目，保留原文以避免两仓分叉出两份不一致的规则。文件内 `docs/wiki/...` 链接按仓库根书写，其中指向未包含页面的部分同上表。
- **复制页内仍有指向源仓库的引用**：除上表 9 篇页面外，`entities/qmd.md` 与 `decisions/qmd-native-mcp-required.md` 引用了源仓库代码文件 `bin/mcp-install.mjs`（该链接写作 `../../bin/mcp-install.mjs`，在源仓库里相对路径也少写一层，已指向不存在的位置）。本仓库不含 `bin/`，这类引用统一按源仓库处理。
- **内容快照，不与源仓库双向同步**：复制件在初始化提交（基线 commit `9589405`）时与源仓库逐字节一致；源仓库此后对 `docs/wiki/entities/wiki-memory-hook.md` 追加了本次拆分的变更记录（其中链接的 `decisions/llm-wiki-repo-split.md` 只存在于源仓库），本仓库未同步这类增量，需要最新内容时回源仓库取。

## 许可

MIT，见 [LICENSE](LICENSE)。

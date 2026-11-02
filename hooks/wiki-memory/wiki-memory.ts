/**
 * wiki-memory: 项目知识库（LLM Wiki）自动初始化与导航注入（pi 扩展）
 *
 * 只注入「目录树 + 最近记录 + 检索命令」，正文按需检索读取，避免把整份索引塞进上下文。
 * 项目根缺库时直接建好骨架（不耗 token、不动已有文件）；qmd 缺失时后台自动安装；
 * 会话开始时后台触发 qmd embed 生成向量索引文件（不阻塞）。
 * 无项目标记（.git 等）的目录不建；qmd 不可用时降级 rg。
 * 集合 path 指向本机不存在的目录（仓库迁移遗留）时自动摘除并按当前路径重绑；
 * Qoder 会话还会写项目级 `.qoder/.mcp.json`，把 qmd MCP 的工作目录钉在项目根。
 * 开关：WIKI_MEMORY_SCAFFOLD=0 关建库，WIKI_MEMORY_QMD=0 关 qmd，
 *       WIKI_MEMORY_INSTALL_QMD=0 关自动安装，QMD_INSTALL_CMD 可换安装命令，
 *       WIKI_MEMORY_EMBED=0 关后台向量生成，WIKI_MEMORY_QODER_MCP=0 关项目级 qmd MCP 注册。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** 知识库相对项目根的路径（wiki-memory-hook.mjs 保持一致） */
const WIKI_REL = "docs/wiki";
const INDEX_FILE = "index.md";
const LOG_FILE = "log.md";
/** 页面分类目录，与 AGENTS.md 第 10 章一致 */
const CATEGORIES = ["entities", "concepts", "sources", "decisions", "queries"];
/** 目录树注入条数上限，超出部分靠检索定位 */
const MAX_TREE_ENTRIES = 60;
/** log.md 尾部注入条数 */
const MAX_LOG_ENTRIES = 5;
/** 向上查找项目根的最大层数 */
const MAX_UP_LEVELS = 8;
/** 视为项目根的标记；没有则不建库，避免在 home/临时目录乱建 */
const PROJECT_MARKERS = [".git", "package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "pom.xml", "build.gradle", "CMakeLists.txt", "composer.json"];
const RAW_DIRS = ["articles", "meetings", "references", "assets"];
const WIKI_DIRS = ["entities", "concepts", "sources", "decisions", "queries"];
/** qmd 官方安装方式（Node ≥22；bun 亦可） */
const DEFAULT_QMD_INSTALL = "npm install -g @tobilu/qmd";
/** 自动安装去重：同一台机器 6 小时内不重复触发 */
const INSTALL_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** 向量索引去重：按项目 1 小时内不重复触发（embed 是增量更新，模型已下载后重跑很轻）；有未完成的嵌入（pending>0）时不受冷却限制 */
const EMBED_COOLDOWN_MS = 60 * 60 * 1000;

type QmdState = "ready" | "created" | "installing" | "missing" | "disabled" | "failed" | "empty";
type EmbedStatus = "triggered" | "recent" | "off";
type McpStatus = "written" | "updated" | "unchanged" | "manual" | "invalid" | "failed" | "off";

function safeRead(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** 从 cwd 向上查找包含 docs/wiki/index.md 的项目根；未命中返回 null */
function findWiki(cwd: string): { root: string; wikiDir: string } | null {
  let dir = resolve(cwd);
  for (let i = 0; i <= MAX_UP_LEVELS; i++) {
    const wikiDir = join(dir, "docs", "wiki");
    if (existsSync(join(wikiDir, INDEX_FILE))) return { root: dir, wikiDir };
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const INDEX_TEMPLATE = () => [
  "---", "type: index", `updated: ${today()}`, "---", "",
  "# Wiki 索引", "",
  "> 人工/Agent 显式查阅用的完整目录；会话中的导航由 wiki-memory hook 注入的目录树提供。",
  "> 格式：`[页面标题](相对路径) — 一行摘要`。", "",
  "## 实体 entities", "", "## 概念 concepts", "", "## 源总结 sources", "", "## 决策 decisions", "", "## 查询沉淀 queries", "",
].join("\n");

const LOG_TEMPLATE = () => [
  "# Wiki 操作日志", "",
  "> 只追加、不修改历史。可用 `grep \"^## \\\[\" docs/wiki/log.md | tail -5` 看最近记录。",
  "> 前缀格式：`## [YYYY-MM-DD] <init|feat|fix|query|lint|chore> | <简述>`", "",
  `## [${today()}] init | wiki-memory hook 自动创建知识库骨架`, "",
].join("\n");

/** 是否值得建库：排除 home，且带项目标记 */
function isProjectRoot(dir: string): boolean {
  if (resolve(dir) === resolve(homedir())) return false;
  return PROJECT_MARKERS.some((m) => existsSync(join(dir, m)));
}

/** 幂等建库：已有 index.md 或非项目根则不动，返回是否新建 */
function ensureWikiSkeleton(dir: string): boolean {
  if (process.env.WIKI_MEMORY_SCAFFOLD === "0") return false;
  if (existsSync(join(dir, "docs", "wiki", INDEX_FILE))) return false;
  if (!isProjectRoot(dir)) return false;
  for (const d of RAW_DIRS) mkdirSync(join(dir, "docs", "raw", d), { recursive: true });
  for (const d of WIKI_DIRS) mkdirSync(join(dir, "docs", "wiki", d), { recursive: true });
  writeFileSync(join(dir, "docs", "wiki", INDEX_FILE), INDEX_TEMPLATE(), "utf8");
  writeFileSync(join(dir, "docs", "wiki", LOG_FILE), LOG_TEMPLATE(), "utf8");
  return true;
}

/** 从 cwd 向上找可建库的项目根并建骨架 */
function scaffoldFrom(cwd: string): void {
  let dir = resolve(cwd);
  for (let i = 0; i <= MAX_UP_LEVELS; i++) {
    if (ensureWikiSkeleton(dir)) return;
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

/** 统计各分类下的页面数（不含 index.md / log.md） */
function countPages(wikiDir: string): { total: number; byCategory: string[] } {
  const byCategory: string[] = [];
  let total = 0;
  for (const cat of CATEGORIES) {
    let n = 0;
    try {
      n = readdirSync(join(wikiDir, cat), { withFileTypes: true }).filter(
        (e) => e.isFile() && e.name.endsWith(".md"),
      ).length;
    } catch {
      n = 0; // 分类目录不存在按 0 处理
    }
    if (n > 0) byCategory.push(`${cat} ${n}`);
    total += n;
  }
  return { total, byCategory };
}

/** 页面标题：frontmatter 的 title 优先，其次首个一级标题 */
function pageTitle(wikiDir: string, cat: string, name: string): string {
  const text = safeRead(join(wikiDir, cat, name)) ?? "";
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const inFm = fm ? /^title:\s*(.+)$/m.exec(fm[1]) : null;
  if (inFm) return inFm[1].trim().replace(/^["']|["']$/g, "");
  const h1 = /^#\s+(.+)$/m.exec(text);
  return h1 ? h1[1].trim() : "";
}

/** 目录树：每页一行「相对路径 — 标题」，超上限则只给数量 */
function buildTree(wikiDir: string): { lines: string[]; shown: number } {
  const lines: string[] = [];
  let shown = 0;
  for (const cat of CATEGORIES) {
    let files: string[] = [];
    try {
      files = readdirSync(join(wikiDir, cat), { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => e.name)
        .sort();
    } catch {
      continue;
    }
    if (files.length === 0) continue;
    lines.push(`- ${cat}/ (${files.length})`);
    for (const name of files) {
      if (shown >= MAX_TREE_ENTRIES) continue;
      const title = pageTitle(wikiDir, cat, name);
      lines.push(`  · ${cat}/${name}${title ? ` — ${title}` : ""}`);
      shown++;
    }
  }
  return { lines, shown };
}

/** 取 log.md 尾部若干条操作记录（以 "## [" 开头的行） */
function recentLog(wikiDir: string): string[] {
  const text = safeRead(join(wikiDir, LOG_FILE));
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("## ["))
    .slice(-MAX_LOG_ENTRIES);
}

/**
 * 执行 qmd 子命令（异步非阻塞）。异常收敛为 ok:false，不向上抛。
 * 显式固定 PWD=cwd：qmd 的 getPwd() 优先取 PWD 环境变量而非 process.cwd()，
 * git-bash/MSYS 等环境下 PWD 可能是陈旧目录或 MSYS 风格路径，会导致索引建到错误位置。
 */
function runQmd(args: string[], cwd: string, timeout: number): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const quote = (s: string) => `"${String(s).replace(/"/g, '\\"')}"`;
    let child: ReturnType<typeof spawn>;
    try {
      const env = { ...process.env, PWD: cwd };
      child = process.platform === "win32"
        ? spawn(`qmd ${args.map(quote).join(" ")}`, { cwd, timeout, shell: true, stdio: ["ignore", "pipe", "pipe"], env })
        : spawn("qmd", [...args], { cwd, timeout, stdio: ["ignore", "pipe", "pipe"], env });
    } catch (err) {
      resolve({ ok: false, out: err instanceof Error ? err.message : String(err) });
      return;
    }
    let out = "";
    child.stdout?.on("data", (d: Buffer) => { out += d.toString("utf8"); });
    child.stderr?.on("data", (d: Buffer) => { out += d.toString("utf8"); });
    child.on("error", (err: Error) => resolve({ ok: false, out: err.message }));
    child.on("close", (code: number | null) => resolve({ ok: code === 0, out }));
  });
}

/** 集合 path 比对用：统一分隔符、去引号与末尾分隔符、忽略大小写（Windows 迁移遗留路径大小写不一） */
function normalizePath(p: string): string {
  return p.split("\\").join("/").replace(/["']/g, "").trim().replace(/\/+$/, "").toLowerCase();
}

/** 集合是否按 targetPath 注册（覆盖 `path:` 行与集合键两种写法；禁用子串匹配，嵌套同名路径会误判） */
function collectionAt(config: string, targetPath: string): boolean {
  const target = normalizePath(targetPath);
  for (const line of config.split(/\r?\n/)) {
    const pathValue = line.match(/^\s*path:\s*(.+?)\s*$/);
    if (pathValue && normalizePath(pathValue[1]) === target) return true;
    // collections 下以路径为键的写法（两空格缩进 + 冒号结尾）
    const key = line.match(/^\s{2}(.+?):\s*$/);
    if (key && normalizePath(key[1]) === target) return true;
  }
  return false;
}

/** 判断 qmd 配置是否已包含本项目 docs/wiki 集合 */
function hasWikiCollection(config: string, root: string): boolean {
  return collectionAt(config, join(root, "docs", "wiki"));
}

/** 判断是否已包含全项目集合（根 == 项目根）；兼容历史路径键写法与 --name project 写法 */
function hasProjectCollection(config: string, root: string): boolean {
  return collectionAt(config, root);
}

/** 解析 collections 段为 [{ name, path }]：两空格缩进且以冒号结尾的行是集合键，其下四空格 path 是属性 */
function listCollections(config: string): { name: string; path: string }[] {
  const items: { name: string; path: string }[] = [];
  let cur: { name: string; path: string } | null = null;
  let inCollections = false;
  for (const line of config.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      inCollections = line.trim() === "collections:";
      cur = null;
      continue;
    }
    if (!inCollections) continue;
    if (/^  \S.*:\s*$/.test(line)) {
      cur = { name: line.trim().replace(/:$/, "").replace(/^["']|["']$/g, ""), path: "" };
      items.push(cur);
      continue;
    }
    const pathValue = line.match(/^    path:\s*(.+?)\s*$/);
    if (pathValue && cur) cur.path = pathValue[1].replace(/^["']|["']$/g, "");
  }
  return items.filter((c) => c.path);
}

/**
 * 摘除失效集合绑定：仓库换盘符/换机器后 `.qmd/index.yml` 里的 path 指向本机不存在的目录，
 * qmd 遍历不到文件也不报错（只报「All collections updated」+ 0 文件），必须按当前路径重绑。
 * 同名集合指向别处时一并摘除，否则后续 `collection add --name wiki` 会因重名失败。
 */
async function dropStaleCollections(config: string, root: string): Promise<number> {
  const wanted = [
    { name: "wiki", path: join(root, "docs", "wiki") },
    { name: "project", path: root },
  ];
  let dropped = 0;
  for (const c of listCollections(config)) {
    const expect = wanted.find((w) => w.name === c.name);
    const stalePath = !existsSync(c.path);
    const moved = expect !== undefined && normalizePath(c.path) !== normalizePath(expect.path);
    if (!stalePath && !moved) continue;
    const res = await runQmd(["collection", "remove", c.name], root, 30000);
    if (res.ok) dropped++;
  }
  return dropped;
}

/**
 * Qoder 只用用户级注册时读不到项目集合：它的 MCP 子进程 cwd 是 HOME、环境只有 HOME/LANG/PATH，
 * qmd 因此回落到全局 `~/.config/qmd/index.yml`。项目级 `<root>/.qoder/.mcp.json` 支持 `cwd` 字段，
 * 把子进程工作目录钉在项目根，qmd 才能向上发现 `.qmd/index.yml`。
 * 仅在 Qoder 会话（QODER 开头的环境变量）或该文件已存在时写入；只增改 qmd 条目，保留其他配置。
 */
function ensureQoderMcp(root: string): McpStatus {
  if (process.env.WIKI_MEMORY_QODER_MCP === "0") return "off";
  const isQoder = Object.keys(process.env).some((k) => /^QODER/i.test(k));
  const file = join(root, ".qoder", ".mcp.json");
  if (!isQoder && !existsSync(file)) return "off";
  let config: Record<string, unknown> = {};
  if (existsSync(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return "invalid"; // 用户手写格式有误：不覆盖，交人工处理
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "invalid";
    config = parsed as Record<string, unknown>;
  }
  const servers = (config.mcpServers ?? {}) as Record<string, Record<string, unknown>>;
  config.mcpServers = servers;
  const current = servers.qmd;
  if (current && current.command !== "qmd") return "manual"; // 用户自定义过，不动
  if (current && current.cwd === root) return "unchanged";
  servers.qmd = { command: "qmd", args: ["mcp"], cwd: root, env: {} };
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } catch {
    return "failed";
  }
  return current ? "updated" : "written";
}

const installMarker = () => join(homedir(), ".wiki-memory", "qmd-install.json");
const embedMarker = () => join(homedir(), ".wiki-memory", "qmd-embed.json");

/** 冷却标记写入（best-effort：写失败不阻断，只是可能重复尝试）；tmp+rename 原子写入，防并发会话读到半截文件 */
function writeMarker(file: string, payload: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(payload), "utf8");
    renameSync(tmp, file);
  } catch {
    // 写标记失败不影响触发，只是可能重复尝试
  }
}

/** 冷却窗口内是否已写过标记（无标记/损坏均视为未记录） */
function attemptedRecently(file: string, cooldownMs: number): boolean {
  const raw = safeRead(file);
  if (!raw) return false;
  try {
    const at = Number(JSON.parse(raw).lastAttempt ?? 0);
    return Date.now() - at < cooldownMs;
  } catch {
    return false;
  }
}

/** 后台触发 qmd 安装（不阻塞会话）；返回是否本次触发 */
function triggerQmdInstall(): boolean {
  if (process.env.WIKI_MEMORY_INSTALL_QMD === "0") return false;
  if (attemptedRecently(installMarker(), INSTALL_COOLDOWN_MS)) return false;
  const cmd = process.env.QMD_INSTALL_CMD || DEFAULT_QMD_INSTALL;
  writeMarker(installMarker(), { lastAttempt: Date.now(), cmd });
  try {
    spawn(cmd, { detached: true, stdio: "ignore", shell: true }).unref();
  } catch {
    return false;
  }
  return true;
}

/** qmd status 输出里的待嵌入文档数（无 Pending 行 = 0） */
function parsePending(out: string): number {
  const m = out.match(/Pending:\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** qmd status 输出里的已索引文件数；解析不到返回 -1（未知，不能当作 0 报失败） */
function parseTotal(out: string): number {
  const m = out.match(/Total:\s*(\d+)\s+files?\s+indexed/);
  return m ? Number(m[1]) : -1;
}

/** 冷却标记按项目存：{ roots: { "<项目根>": { lastAttempt, cmd } } }；旧版单对象格式视为无记录（会触发并覆盖） */
function readEmbedMarkers(): Record<string, { lastAttempt?: number; cmd?: string }> {
  const raw = safeRead(embedMarker());
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    const roots = data && typeof data === "object" ? (data as { roots?: unknown }).roots : undefined;
    return roots && typeof roots === "object" ? (roots as Record<string, { lastAttempt?: number; cmd?: string }>) : {};
  } catch {
    return {};
  }
}

/**
 * 后台触发 qmd embed（生成 .qmd 向量索引文件；首次会下载本地模型）。
 * 不阻塞会话；失败/下载中断由下次会话自动重试：冷却只挡「已完成」的项目，
 * 有 pending 时说明上次没跑完（如会话关闭连带子进程被杀），冷却内也重新触发。
 * 返回状态供注入提示：triggered=本次触发 / recent=1 小时内已完成 / off=关闭或触发失败
 */
function triggerQmdEmbed(root: string, pending: number): EmbedStatus {
  if (process.env.WIKI_MEMORY_EMBED === "0") return "off";
  // 只读一次 marker，冷却判定与写回复用同一份，避免两次读取不一致
  const roots = readEmbedMarkers();
  const at = Number(roots[root]?.lastAttempt ?? 0);
  if (at > 0 && Date.now() - at < EMBED_COOLDOWN_MS && pending === 0) return "recent";
  roots[root] = { lastAttempt: Date.now(), cmd: "qmd embed" };
  writeMarker(embedMarker(), { roots });
  try {
    spawn("qmd embed", { cwd: root, detached: true, stdio: "ignore", shell: true, env: { ...process.env, PWD: root } }).unref();
  } catch {
    return "off";
  }
  return "triggered";
}

/**
 * 保证 qmd 检索可用（幂等）：status 探活（缺失则后台自动安装）→ 无本地索引则 init
 * → 摘除迁移遗留的失效集合 → 无 wiki 集合则 add + context → update → 后台触发 embed 生成向量索引文件。
 * 返回状态供摘要提示，不抛异常。
 */
async function ensureQmd(root: string): Promise<{ state: QmdState; embed: EmbedStatus; mcp: McpStatus }> {
  if (process.env.WIKI_MEMORY_QMD === "0") return { state: "disabled", embed: "off", mcp: "off" };

  const probe = await runQmd(["status"], root, 8000);
  if (!probe.ok) {
    if (triggerQmdInstall()) return { state: "installing", embed: "off", mcp: "off" };
    return { state: attemptedRecently(installMarker(), INSTALL_COOLDOWN_MS) ? "installing" : "missing", embed: "off", mcp: "off" };
  }
  // probe 输出里的 pending 数：>0 说明上次 embed 没跑完，下面用于绕过冷却重试
  const pending = parsePending(probe.out);

  const configFile = join(root, ".qmd", "index.yml");
  let created = false;

  if (!existsSync(configFile)) {
    const init = await runQmd(["init"], root, 10000);
    if (!init.ok) return { state: "failed", embed: "off", mcp: "off" };
    created = true;
  }

  // 按精确路径判断集合是否已存在（避免嵌套同名子目录误判）
  let config = safeRead(configFile) ?? "";
  // 先摘除迁移遗留的失效绑定，再判断要不要新建集合（否则重名会让 add 失败）
  const rebound = await dropStaleCollections(config, root);
  if (rebound > 0) {
    config = safeRead(configFile) ?? "";
    created = true;
  }
  if (!hasWikiCollection(config, root)) {
    const add = await runQmd(["collection", "add", WIKI_REL, "--name", "wiki"], root, 30000);
    if (!add.ok) return { state: "failed", embed: "off", mcp: "off" };
    // 集合描述会让 qmd 在选择文档时更准
    await runQmd(["context", "add", "qmd://wiki", "项目知识库（LLM Wiki）：模块、概念、决策与排查记录"], root, 10000);
    created = true;
  }
  // 全项目集合（best-effort）：让项目根相对路径（qmd get docs/wiki/...）可解析；失败不阻断，wiki 集合仍可用
  if (!hasProjectCollection(config, root)) {
    await runQmd(["collection", "add", ".", "--name", "project"], root, 30000);
    created = true;
  }

  const update = await runQmd(["update"], root, 20000);
  if (!update.ok) return { state: created ? "created" : "failed", embed: "off", mcp: "off" };
  const mcp = ensureQoderMcp(root);
  // 绑定刚变过：update 报绿灯不算数，只看实际索引到的文件数（qmd 对不存在的路径静默跳过）
  if (created || rebound > 0) {
    const after = await runQmd(["status"], root, 8000);
    if (after.ok && parseTotal(after.out) === 0) return { state: "empty", embed: "off", mcp };
  }
  // BM25 索引刷新后再后台生成向量索引文件；失败不降级（下次会话自动重试）
  return { state: created ? "created" : "ready", embed: triggerQmdEmbed(root, pending), mcp };
}

/** 检索命令提示（按需检索，不注入正文）；embed 状态说明向量索引文件生成进度 */
function retrievalHint(state: QmdState, embed: EmbedStatus, mcp: McpStatus): string[] {
  const embedLine =
    embed === "triggered"
      ? "向量索引：本次已触发后台生成（秒级到分钟级）；若下次会话仍未完成会自动重试"
      : embed === "recent"
        ? "向量索引：已就绪（1 小时内生成过，当前无待嵌入文档）"
        : "向量索引：未生成（WIKI_MEMORY_EMBED=0 关闭或触发失败）；qmd query 首次会自行下载模型生成";
  const lines = ["检索（优先 qmd，`grep`/`rg` 仅作回退；按需定位后再读页面，不要通读全部）:"];
  // Qoder 的 MCP 注册是项目级文件，本次写过就要说明生效条件，否则会出现「工具在但 0 篇」
  const mcpLine =
    mcp === "written" || mcp === "updated"
      ? "  · qmd MCP：本次已写入项目级 `.qoder/.mcp.json`（cwd 指向项目根），Qoder 需重启后生效"
      : mcp === "invalid" || mcp === "failed"
        ? "  · qmd MCP：项目级 `.qoder/.mcp.json` 未写入（格式不可解析或写入失败），检索走 shell `qmd`"
        : null;
  if (state === "ready" || state === "created") {
    lines.push('  · `qmd search "<关键词>"` — BM25 关键词，离线可用（首选）');
    lines.push('  · `qmd query "<自然语言问题>"` — 混合检索＋重排，最强（向量索引由 hook 在会话开始后台生成）');
    lines.push(`  · \`qmd get entities/xxx.md --full\` — 取整页（路径直接取上方目录树；\`docs/wiki/...\` 项目根相对路径亦可）`);
    lines.push('  · 以原生 MCP 工具调用 qmd 时参数名与 shell 不同：`get` 用 `file`（**不是 `path`**）、`query` 用 `query`、`multi_get` 用 `pattern`；shell 命令才用上面的位置参数写法');
    lines.push(`  · 回退（qmd 不可用或结果不理想）：\`rg -n "<关键词>" ${WIKI_REL}\``);
    lines.push(`  · qmd 状态：${state === "created" ? "本次已建立 wiki/全项目集合并刷新" : "已就绪（本次已刷新索引），检索首选 qmd"}`);
    lines.push(`  · ${embedLine}`);
    if (mcpLine) lines.push(mcpLine);
  } else if (state === "empty") {
    lines.push("  · qmd 状态：集合已按当前路径重绑，但索引仍为 0 文件 → 先手动 `qmd update`，并核对 `.qmd/index.yml` 里 `path` 指向的目录是否存在");
    lines.push(`  · 回退：\`rg -n "<关键词>" ${WIKI_REL}\``);
    if (mcpLine) lines.push(mcpLine);
  } else if (state === "installing") {
    lines.push(`  · qmd 状态：未安装 → 已触发后台安装（\`${process.env.QMD_INSTALL_CMD || DEFAULT_QMD_INSTALL}\`，需 Node ≥22）；下次会话即可优先用 qmd，本次暂回退\`rg\``);
    lines.push(`  · 回退（本次）：\`rg -n "<关键词>" ${WIKI_REL}\``);
  } else if (state === "disabled") {
    lines.push("  · qmd 状态：已按 WIKI_MEMORY_QMD=0 关闭 → 本次只能回退 `rg`；如需用 qmd 先开索引并 `qmd update`");
    lines.push(`  · 回退：\`rg -n "<关键词>" ${WIKI_REL}\``);
  } else if (state === "failed") {
    lines.push("  · qmd 状态：本次刷新失败，先手动 `qmd update` 重试（qmd 仍是首选）");
    lines.push(`  · 回退：\`rg -n "<关键词>" ${WIKI_REL}\``);
  } else {
    lines.push(`  · qmd 状态：不可用（未安装）→ 检索首选 qmd，安装：\`${DEFAULT_QMD_INSTALL}\`（Node ≥22）`);
    lines.push(`  · 回退：\`rg -n "<关键词>" ${WIKI_REL}\``);
  }
  return lines;
}

/** 组装注入给模型的「知识库导航」（目录树 + 最近记录 + 检索提示，不含正文） */
function buildDigest(wiki: { root: string; wikiDir: string }, state: QmdState, embed: EmbedStatus, mcp: McpStatus, justCreated: boolean): string {
  const { total, byCategory } = countPages(wiki.wikiDir);
  // 刚建的空库只注入短提示，避免用空清单占上下文；附一行 qmd 状态
  if (total === 0) {
    const qmdLine =
      state === "ready" || state === "created"
        ? "qmd：已就绪（索引与集合已建立；当前 0 页，首篇页面沉淀后下次会话自动纳入）"
        : state === "empty"
          ? "qmd：集合已重绑但索引 0 文件，需手动 `qmd update` 并核对 `.qmd/index.yml` 的 path"
          : state === "installing"
          ? "qmd：未安装 → 已触发后台安装，本次暂用 rg"
          : state === "failed"
            ? "qmd：本次刷新失败，可手动 `qmd update` 重试"
            : state === "disabled"
              ? "qmd：已按 WIKI_MEMORY_QMD=0 关闭"
              : "qmd：未安装（`npm install -g @tobilu/qmd`，需 Node ≥22）";
    return [
      "【项目知识库 LLM Wiki｜wiki-memory hook 自动初始化，勿忽略】",
      `本次已${justCreated ? "新建" : "检测到"}知识库骨架：${WIKI_REL}/（当前 0 页，目录已就绪）。`,
      "沉淀时机（AGENTS.md 11.1）：逻辑里程碑（如模块跑通、方案验证通过）完成后，统一把相关知识结构化写入 entities|decisions|concepts|queries，同步更新 index.md 与 log.md，随代码一并提交；全部任务完成后关联条目、补总览和分类，避免信息孤岛。",
      `  · ${qmdLine}`,
    ].join("\n");
  }
  const tree = buildTree(wiki.wikiDir);
  const rest = total - tree.shown;
  const logLines = recentLog(wiki.wikiDir).map((line) => `  ${line.replace(/^## /, "")}`);
  const scope = byCategory.length ? `（${byCategory.join(" · ")}）` : "";

  return [
    "【项目知识库 LLM Wiki｜wiki-memory hook 自动注入】",
    `根目录：${WIKI_REL}/ 共 ${total} 页${scope}`,
    "目录树（只给清单与标题，正文按需检索读取）：",
    ...tree.lines,
    ...(rest > 0 ? [`  …其余 ${rest} 页未列出，用下方检索命令定位`] : []),
    `最近操作（${LOG_FILE} 尾部）:${logLines.length ? "" : "（暂无记录）"}`,
    ...logLines,
    ...retrievalHint(state, embed, mcp),
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  let digest: string | null = null;
  let injected = false;

  pi.on("session_start", async (_event, ctx) => {
    injected = false;
    let wiki = findWiki(ctx.cwd);
    let justCreated = false;
    if (!wiki) {
      scaffoldFrom(ctx.cwd); // 缺库时直接建骨架：不耗 token、不动已有文件
      wiki = findWiki(ctx.cwd);
      justCreated = wiki !== null;
    }
    if (!wiki) {
      digest = null;
      return;
    }
    // 空库（0 页）同样建索引与集合：新 scaffold 的项目会话开始即 qmd 就绪，不必手动 collection add
    const { state, embed, mcp } = await ensureQmd(wiki.root);
    digest = buildDigest(wiki, state, embed, mcp, justCreated);
  });

  // 仅本会话首轮注入一次，避免每轮重复占用上下文
  pi.on("before_agent_start", async () => {
    if (injected || !digest) return;
    injected = true;
    return {
      message: {
        customType: "wiki-memory",
        content: digest,
        display: false,
      },
    };
  });
}

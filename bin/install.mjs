import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = homedir();

// wiki-memory 的各端落点；claude/codex/qoder 的脚本装在用户目录，由配置里的 command 引用
const HOOK = {
  piExtension: "wiki-memory.ts",
  script: { dir: ".wiki-memory", file: "wiki-memory-hook.mjs" },
  opencodePlugin: "reachforstar-wiki-memory.js",
  event: "SessionStart",
  timeout: 40,
};

const QMD = { name: "qmd", command: "qmd", args: ["mcp"] };

const OC_DIR = process.env.XDG_CONFIG_HOME
  ? join(resolve(process.env.XDG_CONFIG_HOME), "opencode")
  : join(HOME, ".config", "opencode");

// Qoder CLI 与 Claude Code 同构；CN 版配置根优先，否则用 ~/.qoder
const QODER_DIR = process.env.QODER_CONFIG_DIR
  ? resolve(process.env.QODER_CONFIG_DIR)
  : existsSync(join(HOME, ".qoder-cn"))
    ? join(HOME, ".qoder-cn")
    : join(HOME, ".qoder");

const AGENTS = {
  pi: { label: "pi", rootDir: join(HOME, ".pi", "agent") },
  claude: { label: "Claude Code", rootDir: join(HOME, ".claude") },
  codex: { label: "Codex", rootDir: join(HOME, ".codex") },
  opencode: { label: "OpenCode", rootDir: OC_DIR },
  qoder: { label: "Qoder CLI", rootDir: QODER_DIR },
};

const HELP = `reachforstar-llm-wiki — 安装 wiki-memory hook 与 qmd MCP

用法:
  node bin/install.mjs [选项]

选项:
  --agent <名称>   目标客户端: pi | claude | codex | opencode | qoder | all（可逗号分隔，默认 all）
  --type <类型>    安装内容: hooks | mcp | all（可逗号合并，默认 all）
  --dry-run, -n    只打印将执行的动作，不写任何文件
  --yes, -y        跳过确认提示
  --no-backup      覆盖前不备份目标文件（默认备份为 <文件>.bak-<时间戳>）
  --list           列出各端落点
  --help           显示帮助

说明:
  知识库规则文件（rules/AGENTS.md、rules/llm-wiki.md）由使用者自己复制到项目，本安装器不分发规则。
  hooks 幂等：重复执行只在内容变化时覆盖，并保留各配置文件中用户的其他字段。

示例:
  node bin/install.mjs --dry-run
  node bin/install.mjs --agent pi,claude --type hooks --yes
  node bin/install.mjs --type mcp
`;

function parseArgs(argv) {
  const opts = { agent: "all", type: "all", yes: false, noBackup: false, dryRun: false, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--agent" || arg === "--type") {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} 需要一个值`);
      opts[arg === "--agent" ? "agent" : "type"] = value;
    } else if (arg === "--dry-run" || arg === "-n") opts.dryRun = true;
    else if (arg === "--yes" || arg === "-y") opts.yes = true;
    else if (arg === "--no-backup") opts.noBackup = true;
    else if (arg === "--list") opts.list = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`未知参数: ${arg}（--help 查看用法）`);
  }
  return opts;
}

function resolveAgents(value) {
  const names = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (!names.length) throw new Error("--agent 至少需要一个客户端");
  if (names.includes("all")) {
    if (names.length !== 1) throw new Error("--agent all 不能与其他客户端合并");
    return Object.keys(AGENTS);
  }
  const invalid = names.filter((name) => !AGENTS[name]);
  if (invalid.length) throw new Error(`未知客户端: ${invalid.join(", ")}（可选: ${Object.keys(AGENTS).join(", ")}）`);
  return names;
}

function resolveTypes(value) {
  const types = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (!types.length) throw new Error("--type 至少需要一种安装内容");
  const invalid = types.filter((t) => t !== "all" && t !== "hooks" && t !== "mcp");
  if (invalid.length) throw new Error(`无效 --type: ${invalid.join(", ")}（可选: hooks | mcp | all）`);
  return new Set(types.includes("all") ? ["hooks", "mcp"] : types);
}

function atomicWrite(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID()}`;
  const mode = existsSync(file) ? lstatSync(file).mode & 0o777 : 0o600;
  try {
    writeFileSync(temporary, content, { encoding: "utf8", mode, flag: "wx" });
    renameSync(temporary, file);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function readJson(file, initial) {
  if (!existsSync(file)) return structuredClone(initial);
  const text = readFileSync(file, "utf8").trim();
  if (!text) return structuredClone(initial);
  // 解析失败时不带出原始片段：配置文件可能含凭据
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`无法解析 ${file}，保持原文件不变`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${file} 不是 JSON 对象，保持原文件不变`);
  return parsed;
}

function writeJson(file, data) {
  atomicWrite(file, `${JSON.stringify(data, null, 2)}\n`);
}

function sameText(a, b) {
  return readFileSync(a, "utf8").replace(/\r\n/g, "\n") === readFileSync(b, "utf8").replace(/\r\n/g, "\n");
}

/** 覆盖前留一份原文件；同一目标在一次运行里只备份一次 */
function backupNote(file, ctx) {
  if (ctx.noBackup || !existsSync(file) || ctx.backedUp.has(file)) return [];
  const dest = `${file}.bak-${ctx.stamp}`;
  if (!ctx.dryRun) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(dest, readFileSync(file), { flag: "wx" });
  }
  ctx.backedUp.add(file);
  return [`${ctx.dryRun ? "将备份原文件" : "备份原文件"} → ${dest}`];
}

/** 内容相同则不动；不同才备份并覆盖 */
function installFile(src, dest, ctx) {
  if (existsSync(dest) && sameText(src, dest)) return { changed: false, notes: [`已是最新，跳过 → ${dest}`] };
  const notes = backupNote(dest, ctx);
  if (!ctx.dryRun) atomicWrite(dest, readFileSync(src));
  return { changed: true, notes: [...notes, `${ctx.dryRun ? "将安装" : "已安装"} → ${dest}`] };
}

function hookCommand() {
  const file = join(HOME, HOOK.script.dir, HOOK.script.file);
  if (/["\r\n$`%]/.test(file)) throw new Error(`hook 安装路径含不支持的 shell 字符: ${file}`);
  return `node "${file}"`;
}

function validateHooks(config) {
  if (config.hooks === undefined) return;
  if (!config.hooks || typeof config.hooks !== "object" || Array.isArray(config.hooks)) throw new Error("hooks 必须是对象");
  for (const [event, groups] of Object.entries(config.hooks)) {
    if (!Array.isArray(groups)) throw new Error(`hooks.${event} 必须是数组`);
  }
}

/** 已存在本 hook 条目时只补齐超时，避免重复追加 */
function ensureSessionStart(config, command, ctx) {
  config.hooks ??= {};
  config.hooks[HOOK.event] ??= [];
  const scriptName = HOOK.script.file;
  const existing = config.hooks[HOOK.event]
    .flatMap((group) => (group && Array.isArray(group.hooks) ? group.hooks : []))
    .filter((hook) => typeof hook?.command === "string" && hook.command.includes(scriptName));
  if (existing.length) {
    let changed = false;
    for (const hook of existing) {
      if (hook.timeout !== HOOK.timeout) {
        hook.timeout = HOOK.timeout;
        changed = true;
      }
    }
    return changed ? "updated" : false;
  }
  config.hooks[HOOK.event].push({ hooks: [{ type: "command", command, timeout: HOOK.timeout }] });
  return "added";
}

/** claude / codex / qoder：脚本装进 ~ 目录，事件合并进各自的配置文件 */
function installConfigHooks(agentName, ctx) {
  const scriptDest = join(HOME, HOOK.script.dir, HOOK.script.file);
  const file = agentName === "codex"
    ? join(AGENTS.codex.rootDir, "hooks.json")
    : join(AGENTS[agentName].rootDir, "settings.json");

  const script = installFile(join(PKG_ROOT, "hooks", "wiki-memory", HOOK.script.file), scriptDest, ctx);
  const config = readJson(file, { hooks: {} });
  validateHooks(config);
  const command = hookCommand();
  const merged = ensureSessionStart(config, command, ctx);
  const notes = [];
  const before = existsSync(file) ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : "";
  const after = `${JSON.stringify(config, null, 2)}\n`;
  if (after !== before) {
    notes.push(...backupNote(file, ctx));
    if (!ctx.dryRun) writeJson(file, config);
    const action = merged === "added" ? "注册" : "更新超时";
    notes.push(`${ctx.dryRun ? `将${action}` : `已${action}`} hooks.${HOOK.event} → ${file}`);
  } else {
    notes.push(`hooks.${HOOK.event} 已存在，跳过 → ${file}`);
  }
  return [...script.notes, ...notes, ...sessionNotes(agentName, script.changed)];
}

function sessionNotes(agentName, changed) {
  if (!changed) return [];
  if (agentName === "codex") return ["提示: Codex 首次以交互模式启动时需确认信任 hook"];
  if (agentName === "qoder") return ["提示: Qoder CLI 只在会话启动时读取 settings.json，运行中的会话需重启"];
  return [];
}

/** pi：扩展放在 extensions/，只在 pi 进程启动时加载 */
function installPiHooks(ctx) {
  const result = installFile(
    join(PKG_ROOT, "hooks", "wiki-memory", HOOK.piExtension),
    join(AGENTS.pi.rootDir, "extensions", HOOK.piExtension),
    ctx,
  );
  const notes = result.changed ? ["提示: pi 仅在进程启动时加载扩展，运行中的会话执行 /reload 或重启 pi"] : [];
  return [...result.notes, ...notes];
}

/** OpenCode：桥接插件在运行时注入 digest 与 qmd MCP，同时复用 ~/.wiki-memory 脚本 */
function installOpencodeHooks(ctx) {
  const script = installFile(join(PKG_ROOT, "hooks", "wiki-memory", HOOK.script.file), join(HOME, HOOK.script.dir, HOOK.script.file), ctx);
  const plugin = installFile(join(PKG_ROOT, "hooks", "wiki-memory", HOOK.opencodePlugin), join(AGENTS.opencode.rootDir, "plugins", HOOK.opencodePlugin), ctx);
  const notes = plugin.changed ? ["提示: 在 OpenCode 插件列表确认 active，必要时重启 OpenCode"] : [];
  return [...script.notes, ...plugin.notes, ...notes];
}

function cliBinary(agentName) {
  return process.env[`MCP_CLI_${agentName.toUpperCase()}`]?.trim() || agentName;
}

function mcpArgs(agentName) {
  const args = ["mcp", "add"];
  if (agentName === "claude") args.push("--scope", "user");
  args.push(QMD.name, "--", QMD.command, ...QMD.args);
  return args;
}

/** 交给各端 CLI 注册，避免手写各家 MCP schema；CLI 缺失时只提示手动命令 */
function registerMcpByCli(agentName, ctx) {
  const binary = cliBinary(agentName);
  const args = mcpArgs(agentName);
  const command = [binary, ...args].join(" ");
  if (ctx.dryRun) return [`将执行 → ${command}`];
  const result = spawnSync(binary, args, { shell: true, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(/\s+/g, " ").trim();
  if (result.status === 0 || /already (exists|added)|duplicat|已存在/i.test(output)) {
    return [`qmd MCP 已注册（${agentName}）`];
  }
  return [
    `qmd MCP 自动注册未完成，请手动执行: ${command}`,
    `  若客户端 CLI 不在 PATH，可用 MCP_CLI_${agentName.toUpperCase()}=<CLI 绝对路径> 重跑`,
  ];
}

/** pi 的 MCP 是用户级 JSON 配置，合并 mcpServers.qmd */
function installPiMcp(ctx) {
  const file = join(AGENTS.pi.rootDir, "mcp.json");
  const config = readJson(file, { mcpServers: {} });
  if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
    throw new Error(`${file} 的 mcpServers 必须是对象，保持原文件不变`);
  }
  if (config.mcpServers[QMD.name] !== undefined) return [`qmd MCP 已存在，跳过 → ${file}`];
  config.mcpServers[QMD.name] = { command: QMD.command, args: QMD.args, env: {}, enabled: true };
  const notes = backupNote(file, ctx);
  if (!ctx.dryRun) writeJson(file, config);
  return [...notes, `${ctx.dryRun ? "将写入" : "已写入"} qmd MCP → ${file}`];
}

function installMcp(agentName, ctx) {
  if (agentName === "pi") return installPiMcp(ctx);
  if (agentName === "opencode") return ["qmd MCP：OpenCode 由桥接插件在运行时注入 mcp.qmd，无需写配置"];
  if (agentName === "qoder") return ["qmd MCP：Qoder 由 wiki-memory hook 在会话启动写项目级 <项目根>/.qoder/.mcp.json，无需用户级注册"];
  return registerMcpByCli(agentName, ctx);
}

function hookSteps(agentName) {
  if (agentName === "pi") return installPiHooks;
  if (agentName === "opencode") return installOpencodeHooks;
  return (ctx) => installConfigHooks(agentName, ctx);
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve_) => {
    rl.question(question, (answer) => {
      rl.close();
      const text = answer.trim().toLowerCase();
      resolve_(text === "" || text === "y" || text === "yes");
    });
  });
}

function printList() {
  console.log("可安装内容（AGENTS.md 规则由使用者自己复制，不在此列）:");
  console.log("  hooks — wiki-memory：会话开始建库、注入知识库导航、准备 qmd");
  for (const [name, ag] of Object.entries(AGENTS)) {
    const target = name === "pi"
      ? join(ag.rootDir, "extensions", HOOK.piExtension)
      : name === "opencode"
        ? join(ag.rootDir, "plugins", HOOK.opencodePlugin)
        : join(ag.rootDir, name === "codex" ? "hooks.json" : "settings.json");
    console.log(`    ${ag.label}: ${target}${name === "pi" || name === "opencode" ? "" : ` + ${join(HOME, HOOK.script.dir, HOOK.script.file)}`}`);
  }
  console.log("  mcp — qmd：暴露 query / get / multi_get / status");
  console.log(`    pi: 合并 ${join(AGENTS.pi.rootDir, "mcp.json")} 的 mcpServers.qmd`);
  console.log("    Claude Code: claude mcp add --scope user qmd -- qmd mcp");
  console.log("    Codex: codex mcp add qmd -- qmd mcp");
  console.log("    OpenCode: 桥接插件运行时注入；Qoder: hook 写项目级 .qoder/.mcp.json");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }
  if (opts.list) {
    printList();
    return;
  }

  const agents = resolveAgents(opts.agent);
  const types = resolveTypes(opts.type);
  const stamp = `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 15)}-${randomUUID().slice(0, 6)}`;
  const ctx = { dryRun: opts.dryRun, noBackup: opts.noBackup, stamp, backedUp: new Set() };

  console.log(`安装目标: ${agents.join(", ")}  内容: ${[...types].join(", ")}${opts.dryRun ? "（dry-run，不写文件）" : ""}`);
  if (!opts.dryRun && !opts.yes && !(await confirm("继续？(Y/n) "))) {
    console.log("已取消");
    return;
  }

  for (const agentName of agents) {
    console.log(`\n[${AGENTS[agentName].label}]`);
    for (const note of types.has("hooks") ? hookSteps(agentName)(ctx) : []) console.log(`  ${note}`);
    for (const note of types.has("mcp") ? installMcp(agentName, ctx) : []) console.log(`  ${note}`);
  }

  console.log("\n下一步：把 rules/AGENTS.md 复制为项目根 AGENTS.md（自己替换），rules/llm-wiki.md 作为参考文档；随后启动会话查看是否注入知识库导航。");
  if (!opts.dryRun) console.log("qmd 未安装时由 hook 在会话开始后台安装（Node ≥22），本次会话先用 rg 回退。");
}

await main();
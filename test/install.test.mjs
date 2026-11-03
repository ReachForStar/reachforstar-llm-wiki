import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const installer = join(root, "bin", "install.mjs");
const hookSrc = join(root, "hooks", "wiki-memory");

const read = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

/** 各端配置根都落在临时 HOME 下，避免碰到真实用户配置 */
function makeHome() {
  const home = mkdtempSync(join(tmpdir(), "reachforstar-install-"));
  const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config") };
  delete env.QODER_CONFIG_DIR;
  return { home, env };
}

function run({ home, env }, args, extraEnv = {}) {
  const res = spawnSync("node", [installer, ...args], {
    env: { ...env, ...extraEnv },
    encoding: "utf8",
    timeout: 60_000,
  });
  return { status: res.status, out: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

const sessionStartCommand = (file) => {
  const config = JSON.parse(read(file));
  return config.hooks.SessionStart.flatMap((group) => group.hooks).map((hook) => hook.command);
};

test("pi：扩展装进 extensions，dry-run 不写文件", () => {
  const ctx = makeHome();
  const dest = join(ctx.home, ".pi", "agent", "extensions", "wiki-memory.ts");

  const dry = run(ctx, ["--agent", "pi", "--type", "hooks", "--dry-run"]);
  assert.equal(dry.status, 0, dry.out);
  assert.equal(existsSync(dest), false, "dry-run 不应写文件");
  assert.match(dry.out, /将安装/);

  const dryAll = run(ctx, ["--agent", "pi", "--type", "all", "--dry-run"]);
  assert.equal(dryAll.status, 0, dryAll.out);
  assert.equal(existsSync(join(ctx.home, ".pi", "agent", "mcp.json")), false, "dry-run 不应写 MCP 配置");

  const real = run(ctx, ["--agent", "pi", "--type", "hooks", "--yes"]);
  assert.equal(real.status, 0, real.out);
  assert.equal(read(dest), read(join(hookSrc, "wiki-memory.ts")));
});

test("Claude Code：脚本落到 ~/.wiki-memory，SessionStart 合并进 settings.json", () => {
  const ctx = makeHome();
  const settings = join(ctx.home, ".claude", "settings.json");
  mkdirSync(join(ctx.home, ".claude"), { recursive: true });
  writeFileSync(settings, `${JSON.stringify({ env: { KEEP: "1" } }, null, 2)}\n`, "utf8");

  const res = run(ctx, ["--agent", "claude", "--type", "hooks", "--yes"]);
  assert.equal(res.status, 0, res.out);
  assert.equal(read(join(ctx.home, ".wiki-memory", "wiki-memory-hook.mjs")), read(join(hookSrc, "wiki-memory-hook.mjs")));

  const config = JSON.parse(read(settings));
  assert.deepEqual(config.env, { KEEP: "1" }, "用户其他字段应保留");
  const commands = sessionStartCommand(settings);
  assert.equal(commands.length, 1);
  assert.match(commands[0], /wiki-memory-hook\.mjs/);
  assert.equal(JSON.parse(read(settings)).hooks.SessionStart[0].hooks[0].timeout, 40);
  assert.equal(readdirSync(join(ctx.home, ".claude")).some((f) => f.startsWith("settings.json.bak-")), true, "覆盖前应备份");
});

test("Codex：hooks.json 追加且保留既有条目，重复执行幂等", () => {
  const ctx = makeHome();
  const file = join(ctx.home, ".codex", "hooks.json");
  mkdirSync(join(ctx.home, ".codex"), { recursive: true });
  const existing = { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node other.mjs", timeout: 5 }] }] } };
  writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

  assert.equal(run(ctx, ["--agent", "codex", "--type", "hooks", "--yes"]).status, 0);
  const afterFirst = read(file);
  const commands = sessionStartCommand(file);
  assert.equal(commands.length, 2, "既有 hook 应保留");
  assert.match(commands[1], /wiki-memory-hook\.mjs/);

  assert.equal(run(ctx, ["--agent", "codex", "--type", "hooks", "--yes"]).status, 0);
  assert.equal(read(file), afterFirst, "重复执行不应改写配置");
});

test("配置内超时被纠正为 40 秒", () => {
  const ctx = makeHome();
  const file = join(ctx.home, ".claude", "settings.json");
  const stale = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: "command", command: `node "${join(ctx.home, ".wiki-memory", "wiki-memory-hook.mjs")}"`, timeout: 10 }] },
      ],
    },
  };
  mkdirSync(join(ctx.home, ".claude"), { recursive: true });
  writeFileSync(file, `${JSON.stringify(stale, null, 2)}\n`, "utf8");

  const res = run(ctx, ["--agent", "claude", "--type", "hooks", "--yes"]);
  assert.equal(res.status, 0, res.out);
  assert.equal(JSON.parse(read(file)).hooks.SessionStart[0].hooks[0].timeout, 40);
  assert.equal(sessionStartCommand(file).length, 1, "不应追加重复条目");
});

test("OpenCode：桥接插件与共享脚本都安装", () => {
  const ctx = makeHome();
  const res = run(ctx, ["--agent", "opencode", "--type", "hooks", "--yes"]);
  assert.equal(res.status, 0, res.out);
  const plugin = join(ctx.home, ".config", "opencode", "plugins", "reachforstar-wiki-memory.js");
  assert.equal(read(plugin), read(join(hookSrc, "reachforstar-wiki-memory.js")));
  assert.equal(existsSync(join(ctx.home, ".wiki-memory", "wiki-memory-hook.mjs")), true);
});

test("Qoder：配置根存在 CN 版时优先写 ~/.qoder-cn", () => {
  const ctx = makeHome();
  mkdirSync(join(ctx.home, ".qoder-cn"), { recursive: true });
  const res = run(ctx, ["--agent", "qoder", "--type", "hooks", "--yes"]);
  assert.equal(res.status, 0, res.out);
  assert.match(sessionStartCommand(join(ctx.home, ".qoder-cn", "settings.json"))[0], /wiki-memory-hook\.mjs/);
  assert.equal(existsSync(join(ctx.home, ".qoder")), false, "不应另建 ~/.qoder");
});

test("pi MCP：合并 mcpServers.qmd 并保留其他 server", () => {
  const ctx = makeHome();
  const file = join(ctx.home, ".pi", "agent", "mcp.json");
  mkdirSync(join(ctx.home, ".pi", "agent"), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ mcpServers: { demo: { command: "demo" } } }, null, 2)}\n`, "utf8");

  assert.equal(run(ctx, ["--agent", "pi", "--type", "mcp", "--yes"]).status, 0);
  const config = JSON.parse(read(file));
  assert.deepEqual(config.mcpServers.demo, { command: "demo" });
  assert.deepEqual(config.mcpServers.qmd, { command: "qmd", args: ["mcp"], env: {}, enabled: true });
});

test("Claude Code / Codex 的 qmd MCP 走各自 CLI，缺失时给手动命令", () => {
  const ctx = makeHome();
  const dry = run(ctx, ["--agent", "claude,codex", "--type", "mcp", "--dry-run"]);
  assert.equal(dry.status, 0, dry.out);
  assert.match(dry.out, /claude mcp add --scope user qmd -- qmd mcp/);
  assert.match(dry.out, /codex mcp add qmd -- qmd mcp/);

  // 覆盖成不存在的 CLI：只应给出手动命令，不算安装失败
  const missing = run(ctx, ["--agent", "claude", "--type", "mcp", "--yes"], { MCP_CLI_CLAUDE: "reachforstar-missing-cli-9f2c" });
  assert.equal(missing.status, 0, missing.out);
  assert.match(missing.out, /请手动执行/);
});

test("参数错误直接失败，不写任何文件", () => {
  const ctx = makeHome();
  const bad = run(ctx, ["--agent", "nope", "--yes"]);
  assert.notEqual(bad.status, 0);
  assert.match(bad.out, /未知客户端/);

  const badType = run(ctx, ["--type", "skills", "--yes"]);
  assert.notEqual(badType.status, 0);
  assert.match(badType.out, /无效 --type/);
  assert.equal(existsSync(join(ctx.home, ".pi")), false);
});
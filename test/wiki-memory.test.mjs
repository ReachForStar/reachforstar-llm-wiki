import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const hook = join(root, "hooks", "wiki-memory", "wiki-memory-hook.mjs");

// hook 会调用真实 qmd 做 init/collection/update，本机无 qmd 时跳过（不阻塞测试）
const hasQmd = spawnSync("qmd", ["status"], { shell: process.platform === "win32", encoding: "utf8", timeout: 30000 }).status === 0;

function makeWiki() {
  const home = mkdtempSync(join(tmpdir(), "reachforstar-wiki-home-"));
  const project = mkdtempSync(join(tmpdir(), "reachforstar-wiki-memory-"));
  const wikiDir = join(project, "docs", "wiki", "entities");
  mkdirSync(wikiDir, { recursive: true });
  writeFileSync(join(project, "package.json"), "{}\n", "utf8");
  writeFileSync(
    join(project, "docs", "wiki", "index.md"),
    `---\ntype: index\nupdated: 2026-10-07\n---\n\n# Wiki 索引\n`,
    "utf8",
  );
  writeFileSync(
    join(project, "docs", "wiki", "log.md"),
    "# Wiki 操作日志\n\n## [2026-10-07] init | 测试页面\n",
    "utf8",
  );
  writeFileSync(
    join(wikiDir, "demo.md"),
    `---\ntitle: 演示页面\ntype: entity\n---\n\n# 演示页面\n\n集合重绑验证段落：quartz-binding-marker\n`,
    "utf8",
  );
  return { project, home };
}

function runHook({ project, home }, extraEnv = {}, opts = {}) {
  // WIKI_MEMORY_EMBED=0：测试机不触发后台向量生成（首次会下载数 GB 模型）
  // 测试本身可能跑在 Qoder 会话里，qoderEnv:false 时要把宿主注入的 QODER 变量剔掉
  const base = { ...process.env };
  if (opts.qoderEnv === false) for (const key of Object.keys(base)) if (/^QODER/i.test(key)) delete base[key];
  const env = {
    ...base,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_CACHE_HOME: join(home, ".cache"),
    WIKI_MEMORY_EMBED: "0",
    ...extraEnv,
  };
  const res = spawnSync("node", [hook], {
    cwd: project,
    env,
    input: JSON.stringify({ cwd: project }),
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(res.status, 0, res.stderr);
  const digest = JSON.parse(res.stdout).hookSpecificOutput.additionalContext;
  return { digest, project };
}

// 仓库迁移到本机后遗留的集合绑定：路径带反斜杠且在本机不存在
const STALE = String.raw`collections:
  F:\missing-drive\docs\wiki:
    path: F:\missing-drive\docs\wiki
    pattern: "**/*.md"
  wiki:
    path: F:\missing-drive\docs\wiki
    pattern: "**/*.md"
  project:
    path: F:\missing-drive
    pattern: "**/*.md"
models:
  embed: hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf
`;

test("集合 path 指向迁移前目录时自动重绑，不再静默 0 文件", { skip: !hasQmd }, () => {
  const { project, home } = makeWiki();
  mkdirSync(join(project, ".qmd"), { recursive: true });
  writeFileSync(join(project, ".qmd", "index.yml"), STALE, "utf8");

  const { digest } = runHook({ project, home });
  const config = readFileSync(join(project, ".qmd", "index.yml"), "utf8");
  assert.match(digest, /qmd 状态：/, "注入内容缺少 qmd 状态行");
  assert.doesNotMatch(digest, /本次刷新失败|索引仍为 0 文件/, `hook 未修复失效绑定：\n${digest}`);
  assert.equal(config.includes("missing-drive"), false, `遗留路径未摘除：\n${config}`);
  assert.match(config, new RegExp(`path: ${project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `集合未按当前路径重绑：\n${config}`);

  const status = spawnSync("qmd", ["status"], { cwd: project, encoding: "utf8", timeout: 60_000 });
  assert.match(status.stdout, /Total:\s+[1-9]\d* files indexed/, status.stdout + status.stderr);
});

test("Qoder 会话写项目级 .qoder/.mcp.json 并保留既有配置", { skip: !hasQmd }, () => {
  const { project, home } = makeWiki();
  mkdirSync(join(project, ".qoder"), { recursive: true });
  writeFileSync(
    join(project, ".qoder", ".mcp.json"),
    JSON.stringify({ mcpServers: { other: { command: "other" } } }, null, 2),
    "utf8",
  );

  const { digest } = runHook({ project, home }, { QODER_CONFIG_DIR: home });
  const file = join(project, ".qoder", ".mcp.json");
  const config = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(config.mcpServers.qmd, { command: "qmd", args: ["mcp"], cwd: project, env: {} });
  assert.deepEqual(config.mcpServers.other, { command: "other" }, "覆盖了项目已有的其他 MCP 配置");
  assert.match(digest, /\.qoder\/\.mcp\.json/, "注入内容未说明本次写入");

  // 内容已是当前项目路径，第二次运行不重复改写
  const before = readFileSync(file, "utf8");
  runHook({ project, home }, { QODER_CONFIG_DIR: home });
  assert.equal(readFileSync(file, "utf8"), before);
});

test("非 Qoder 会话不新建 .qoder 目录", { skip: !hasQmd }, () => {
  const { project, home } = makeWiki();
  runHook({ project, home }, {}, { qoderEnv: false });
  assert.equal(existsSync(join(project, ".qoder")), false);
});

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME_DIR = homedir();
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map(); // 目录 -> { at, digest }

function runHook(stdin) {
  const script = join(HOME_DIR, ".wiki-memory", "wiki-memory-hook.mjs");
  if (!existsSync(script)) return null;
  let r;
  try {
    r = spawnSync("node", [script], {
      input: JSON.stringify(stdin),
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
  if (r.error) return null;
  const out = String(r.stdout ?? "").trim();
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function digestFor(dir) {
  const hit = cache.get(dir);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.digest;
  const res = runHook({ cwd: dir });
  const digest = res?.hookSpecificOutput?.additionalContext ?? null;
  if (digest) cache.set(dir, { at: Date.now(), digest });
  return digest;
}

const reachforstarWikiMemory = async (ctx) => {
  const dir = ctx.directory || process.cwd();
  return {
    config: (cfg) => {
      cfg.mcp ??= {};
      if (!cfg.mcp.qmd) cfg.mcp.qmd = { type: "local", command: ["qmd", "mcp"], enabled: true };
    },
    "experimental.chat.system.transform": (_input, output) => {
      const digest = digestFor(dir);
      if (digest) output.system.push(digest);
    },
  };
};

export default {
  id: "reachforstar-wiki-memory",
  server: reachforstarWikiMemory,
  async setup(ctx) {
    const dir = ctx.location.directory;
    await ctx.mcp.transform((editor) => {
      if (!editor.get("qmd")) {
        editor.set("qmd", { type: "local", command: ["qmd", "mcp"], disabled: false });
      }
    });
    await ctx.session.hook("context", (event) => {
      const digest = digestFor(dir);
      if (digest) event.system.push({ type: "text", text: digest });
    });
  },
};

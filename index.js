import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { sessionEntryReader } from "./session-entry.js";
import { resolveRouteFromEntry } from "./requester-route.js";
import { resolveVisibleSpawn } from "./visible-spawn.js";
import { DEFAULT_MESSAGE } from "./notice-message.js";
import { createLaunchNotifier } from "./launch-notice.js";

const PLUGIN_ID = "subagent-launch-notice";
const DEFAULT_VISIBLE_MESSAGE = "🦞 [Sottoagente avviato](<{sessionUrl}>): `{agent}`";
const DEFAULT_CHANNELS = ["discord"];
const STATE_MAX_ENTRIES = 2000;
const STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeChannel(value) {
  return normalizeString(value).toLowerCase();
}

function resolveConfig(api) {
  const cfg = asObject(api.pluginConfig);
  const channels = Array.isArray(cfg.channels)
    ? cfg.channels.map(normalizeChannel).filter(Boolean)
    : DEFAULT_CHANNELS;

  return {
    message: normalizeString(cfg.message) || DEFAULT_MESSAGE,
    visibleMessage: normalizeString(cfg.visibleMessage) || DEFAULT_VISIBLE_MESSAGE,
    notifyVisible: cfg.notifyVisible !== false,
    channels: new Set(channels.length ? channels : DEFAULT_CHANNELS),
    silent: cfg.silent !== false,
    includeNested: cfg.includeNested === true,
  };
}

function resolveOpenClawBin() {
  const candidates = [
    process.env.OPENCLAW_BIN,
    path.join(path.dirname(process.execPath), "openclaw"),
    "/usr/local/node-22/bin/openclaw",
    "openclaw",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "openclaw" || fs.existsSync(candidate)) return candidate;
  }

  return "openclaw";
}

function statePath() {
  return path.join(os.homedir(), ".openclaw", "state", PLUGIN_ID, "sent.json");
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), "utf-8"));
    if (parsed?.version === 1 && parsed.sent && typeof parsed.sent === "object") {
      return pruneState(parsed);
    }
  } catch {}
  return { version: 1, sent: {} };
}

function pruneState(state) {
  const now = Date.now();
  const sent = Object.fromEntries(
    Object.entries(asObject(state.sent))
      .filter(([, entry]) => typeof entry?.timestamp === "number" && now - entry.timestamp <= STATE_MAX_AGE_MS)
      .sort(([, left], [, right]) => (right.timestamp || 0) - (left.timestamp || 0))
      .slice(0, STATE_MAX_ENTRIES),
  );
  return { version: 1, sent };
}

function saveState(state) {
  const filePath = statePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(pruneState(state), null, 2)}\n`, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

function markSentOnce(key, event) {
  if (!key) return false;
  const state = loadState();
  if (state.sent[key]) return false;
  state.sent[key] = {
    timestamp: Date.now(),
    childSessionKey: event.childSessionKey,
    runId: event.runId,
  };
  saveState(state);
  return true;
}

function isNestedRequester(ctx) {
  const requesterSessionKey = normalizeString(ctx?.requesterSessionKey);
  return requesterSessionKey.includes(":subagent:") || requesterSessionKey.includes(":dashboard:");
}

async function resolveRequesterRoute(event, ctx) {
  const { entry } = await sessionEntryReader.read({ sessionKey: ctx?.requesterSessionKey, ctx });
  return resolveRouteFromEntry(event.requester, entry);
}

function sendNotice({ channel, accountId, target, threadId, message, silent }) {
  const args = [
    "message",
    "send",
    "--channel",
    channel,
    "--target",
    target,
    "--message",
    message,
  ];
  if (accountId) args.push("--account", accountId);
  if (threadId !== undefined && threadId !== null && String(threadId).trim()) {
    args.push("--thread-id", String(threadId));
  }
  if (silent) args.push("--silent");

  try {
    const child = spawn(resolveOpenClawBin(), args, {
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        PATH: process.env.PATH || "/usr/local/node-22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      },
    });
    child.on("error", (err) => {
      console.error(`[${PLUGIN_ID}] message send failed: ${String(err)}`);
    });
    child.unref();
  } catch (err) {
    console.error(`[${PLUGIN_ID}] message send spawn failed: ${String(err)}`);
  }
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Subagent Launch Notice",
  description: "Sends a short visible message to the requester route when a subagent is spawned.",
  register(api) {
    const notify = createLaunchNotifier(api, {
      resolveConfig, resolveRequesterRoute, isNestedRequester, markSentOnce, sendNotice,
    });

    api.on("subagent_spawned", notify, { timeoutMs: 1000 });

    // Visible spawns never emit `subagent_spawned`; observe the tool call instead.
    api.on("after_tool_call", async (event, ctx) => {
      const spawn = resolveVisibleSpawn(event);
      if (!spawn) return;
      await notify({ ...spawn, visible: true }, {
        ...ctx,
        requesterSessionKey: normalizeString(ctx?.requesterSessionKey) || normalizeString(ctx?.sessionKey),
      });
    }, { matcher: ["sessions_spawn"], timeoutMs: 1000 });
  },
});

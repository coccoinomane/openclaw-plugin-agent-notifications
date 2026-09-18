import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { sessionEntryReader } from "./session-entry.js";
import { resolveVisibleSpawn } from "./visible-spawn.js";

const PLUGIN_ID = "subagent-launch-notice";
const DEFAULT_MESSAGE = "🦞 È stato lanciato un sottoagente: ci metterà un po’. Ti aggiorno appena ha finito.";
const DEFAULT_VISIBLE_MESSAGE = "🦞 Sottoagente avviato: `{agent}`\n-# [Segui la sessione](<{sessionUrl}>)";
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

function shortId(value, length = 8) {
  const normalized = normalizeString(value);
  return normalized ? normalized.slice(0, length) : "";
}

function placeholderValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function renderTemplate(template, values) {
  return normalizeString(template).replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return match;
    return placeholderValue(values[key]);
  });
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
  const direct = asObject(event.requester);
  const { entry } = await sessionEntryReader.read({ sessionKey: ctx?.requesterSessionKey, ctx });
  const session = asObject(entry);
  const deliveryContext = asObject(session.deliveryContext);
  const origin = asObject(session.origin);
  const route = asObject(session.route);
  const routeTarget = asObject(route.target);
  const routeThread = asObject(route.thread);

  return {
    channel:
      normalizeString(direct.channel) ||
      normalizeString(deliveryContext.channel) ||
      normalizeString(route.channel) ||
      normalizeString(session.lastChannel) ||
      normalizeString(origin.provider) ||
      normalizeString(origin.surface),
    accountId:
      normalizeString(direct.accountId) ||
      normalizeString(deliveryContext.accountId) ||
      normalizeString(origin.accountId) ||
      normalizeString(route.accountId) ||
      normalizeString(session.lastAccountId),
    to:
      normalizeString(direct.to) ||
      normalizeString(deliveryContext.to) ||
      normalizeString(origin.to) ||
      normalizeString(routeTarget.to) ||
      normalizeString(session.lastTo),
    threadId:
      direct.threadId ??
      deliveryContext.threadId ??
      origin.threadId ??
      routeThread.id ??
      session.lastThreadId,
  };
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

// Lines that depend on the session URL are dropped when the Control UI is
// disabled and the spawn result carries no `sessionUrl`.
function visibleTemplate(template, sessionUrl) {
  if (sessionUrl) return template;
  return template.split("\n").filter((line) => !line.includes("{sessionUrl}")).join("\n");
}

function buildNoticeMessage(config, event, ctx, route) {
  const agent = normalizeString(event.label) || normalizeString(event.agentId) || "subagent";
  const childSessionKey = normalizeString(event.childSessionKey);
  const requesterSessionKey = normalizeString(ctx?.requesterSessionKey);
  const runId = normalizeString(event.runId);
  const resolvedModel = normalizeString(event.resolvedModel);
  const resolvedProvider = normalizeString(event.resolvedProvider);

  const sessionUrl = normalizeString(event.sessionUrl);
  const template = event.visible === true ? visibleTemplate(config.visibleMessage, sessionUrl) : config.message;

  return renderTemplate(template, {
    agent,
    agentId: normalizeString(event.agentId),
    label: normalizeString(event.label),
    mode: normalizeString(event.mode),
    runId,
    shortRunId: shortId(runId),
    childSessionKey,
    shortChildSessionKey: shortId(childSessionKey),
    requesterSessionKey,
    shortRequesterSessionKey: shortId(requesterSessionKey),
    resolvedModel,
    resolvedProvider,
    model: resolvedModel,
    provider: resolvedProvider,
    threadRequested: event.threadRequested === true,
    visible: event.visible === true,
    sessionUrl,
    ownerLabel: normalizeString(event.ownerLabel),
    channel: normalizeString(route.channel),
    accountId: normalizeString(route.accountId),
    target: normalizeString(route.to),
    threadId: route.threadId ?? "",
  });
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "Subagent Launch Notice",
  description: "Sends a short visible message to the requester route when a subagent is spawned.",
  register(api) {
    const notify = async (event, ctx) => {
      const config = resolveConfig(api);
      if (event.visible === true && !config.notifyVisible) return;
      const route = await resolveRequesterRoute(event, ctx);
      const channel = normalizeChannel(route.channel);
      const target = normalizeString(route.to);
      if (!channel || !target) return;
      if (!config.channels.has(channel) && !config.channels.has("*")) return;
      if (!config.includeNested && isNestedRequester(ctx)) return;

      const message = buildNoticeMessage(config, event, ctx, route);
      if (!message) return;

      const key = normalizeString(event.runId) || normalizeString(event.childSessionKey);
      if (!markSentOnce(key, event)) return;

      sendNotice({
        channel,
        accountId: normalizeString(route.accountId),
        target,
        threadId: route.threadId,
        message,
        silent: config.silent,
      });
    };

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

import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function parseAgentId(sessionKey) {
  const parts = String(sessionKey || "").trim().split(":");
  return parts[0] === "agent" && parts[1] ? parts[1] : "";
}

function resolveHomePath(value) {
  const raw = String(value || "").trim();
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

function resolveOpenClawHome() {
  return resolveHomePath(process.env.OPENCLAW_STATE_DIR || process.env.OPENCLAW_HOME || path.join(os.homedir(), ".openclaw"));
}

function readLegacySessionEntry(requesterSessionKey) {
  const agentId = parseAgentId(requesterSessionKey);
  if (!agentId) return null;
  const sessionsPath = path.join(resolveOpenClawHome(), "agents", agentId, "sessions", "sessions.json");
  const parsed = JSON.parse(fs.readFileSync(sessionsPath, "utf-8"));
  return asObject(asObject(parsed.sessions)[requesterSessionKey] ?? asObject(parsed)[requesterSessionKey]);
}

async function loadDefaultRuntime() {
  let runtimePath;
  try {
    runtimePath = require.resolve("openclaw/plugin-sdk/session-store-runtime");
  } catch (error) {
    const message = String(error?.message || error);
    if (error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || (
      error?.code === "MODULE_NOT_FOUND" && message.includes("openclaw/plugin-sdk/session-store-runtime")
    )) return null;
    throw error;
  }
  return await import(pathToFileURL(runtimePath).href);
}

export function createSessionEntryReader({ loadRuntime = loadDefaultRuntime, legacyReader = readLegacySessionEntry, logger = console } = {}) {
  let runtimePromise;
  const getRuntime = async () => {
    if (!runtimePromise) runtimePromise = Promise.resolve().then(loadRuntime).then((runtime) => (
      runtime && typeof runtime.getSessionEntry === "function" ? runtime : null
    )).catch((error) => ({ error }));
    return runtimePromise;
  };

  return {
    async read({ sessionKey, ctx = {} }) {
      if (ctx?.sessionEntry && typeof ctx.sessionEntry === "object") {
        return { entry: ctx.sessionEntry, source: "hook" };
      }

      const runtime = await getRuntime();
      if (runtime?.error) {
        logger.error?.(`[subagent-launch-notice] session runtime lookup unavailable: ${String(runtime.error)}`);
        return { entry: null, source: "runtime-error" };
      }
      if (runtime) {
        const agentId = parseAgentId(sessionKey);
        try {
          const entry = await runtime.getSessionEntry({ sessionKey, agentId, env: process.env });
          return { entry: entry && typeof entry === "object" ? entry : null, source: "canonical" };
        } catch (error) {
          logger.error?.(`[subagent-launch-notice] canonical session entry lookup failed: ${String(error)}`);
          return { entry: null, source: "canonical-error" };
        }
      }

      try {
        return { entry: legacyReader(sessionKey, ctx), source: "legacy" };
      } catch (error) {
        logger.error?.(`[subagent-launch-notice] legacy session entry lookup failed: ${String(error)}`);
        return { entry: null, source: "legacy-error" };
      }
    },
  };
}

export const sessionEntryReader = createSessionEntryReader();

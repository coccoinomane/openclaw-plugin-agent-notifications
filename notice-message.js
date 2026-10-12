import { visibleTemplate } from "./visible-spawn.js";

export const DEFAULT_MESSAGE = "🦞 È stato lanciato un sottoagente: ci metterà un po’. Ti aggiorno appena ha finito.";

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function shortId(value, length = 8) {
  const normalized = normalizeString(value);
  return normalized ? normalized.slice(0, length) : "";
}

function renderTemplate(template, values) {
  return normalizeString(template).replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return match;
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function normalTemplate(template, sessionUrl) {
  if (sessionUrl) return template;
  // Preserve useful inline text instead of dropping its whole line.
  return String(template || "")
    .replace(/\[([^\]]+)\]\(<?\{sessionUrl\}>?\)/g, "$1")
    .replace(/<?\{sessionUrl\}>?/g, "");
}

export function buildNoticeMessage(config, event, ctx, route) {
  const agent = normalizeString(event.label) || normalizeString(event.agentId) || "subagent";
  const childSessionKey = normalizeString(event.childSessionKey);
  const requesterSessionKey = normalizeString(ctx?.requesterSessionKey);
  const runId = normalizeString(event.runId);
  const resolvedModel = normalizeString(event.resolvedModel);
  const resolvedProvider = normalizeString(event.resolvedProvider);
  const sessionUrl = normalizeString(event.sessionUrl);
  const template = event.visible === true
    ? visibleTemplate(config.visibleMessage, sessionUrl)
    : normalTemplate(config.message, sessionUrl);

  let message = renderTemplate(template, {
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

  if (event.visible !== true) {
    if (!message && normalizeString(config.message).includes("{sessionUrl}")) message = DEFAULT_MESSAGE;
    // Existing custom messages gain a link too, without config migration.
    if (message && sessionUrl && !message.includes(sessionUrl)) {
      message += `\n🔎 [Apri sessione](<${sessionUrl}>)`;
    }
  }
  return message;
}

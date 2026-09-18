// Visible spawns (`sessions_spawn` with `visible: true`) create a dashboard
// session through `sessions.create` and never emit `subagent_spawned`, so the
// notice is derived from the tool call observed via `after_tool_call`.

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function parseJsonObject(text) {
  const raw = normalizeString(text);
  if (!raw.startsWith("{")) return {};
  try {
    return asObject(JSON.parse(raw));
  } catch {
    return {};
  }
}

function looksLikeSpawnResult(value) {
  const candidate = asObject(value);
  return Boolean(normalizeString(candidate.childSessionKey) || normalizeString(candidate.sessionUrl));
}

// The host may hand over the raw result object, a `{ details }` wrapper, or
// the persisted `{ content: [{ type: "text", text: "<json>" }] }` shape.
export function extractSpawnResult(result) {
  if (typeof result === "string") return parseJsonObject(result);
  const direct = asObject(result);
  if (looksLikeSpawnResult(direct)) return direct;
  if (looksLikeSpawnResult(direct.details)) return asObject(direct.details);
  const content = Array.isArray(direct.content) ? direct.content : [];
  for (const block of content) {
    const parsed = parseJsonObject(asObject(block).text);
    if (looksLikeSpawnResult(parsed)) return parsed;
  }
  return {};
}

export function resolveVisibleSpawn(event) {
  const params = asObject(event?.params);
  if (params.visible !== true) return null;
  if (normalizeString(event?.error)) return null;

  const result = extractSpawnResult(event?.result);
  const status = normalizeString(result.status);
  if (status && status !== "accepted") return null;

  const childSessionKey = normalizeString(result.childSessionKey);
  const runId = normalizeString(result.runId) || normalizeString(event?.runId);
  if (!childSessionKey && !runId) return null;

  const owner = asObject(result.owner);
  return {
    agentId: normalizeString(params.agentId),
    label: normalizeString(params.label) || normalizeString(params.taskName),
    mode: normalizeString(result.mode) || normalizeString(params.mode) || "run",
    runId,
    childSessionKey,
    sessionUrl: normalizeString(result.sessionUrl),
    ownerLabel: normalizeString(owner.label) || normalizeString(owner.id),
  };
}

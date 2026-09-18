import test from "node:test";
import assert from "node:assert/strict";
import { extractSpawnResult, resolveVisibleSpawn } from "../visible-spawn.js";

const accepted = {
  status: "accepted",
  childSessionKey: "agent:main:dashboard:dd8c35ca-ba6d-440b-8ea7-587e3fbd8d7d",
  runId: "224844fe-12b2-4d0d-917c-c62df3125772",
  mode: "run",
  sessionUrl: "https://example.test/chat/main/dd8c35ca",
  owner: { type: "agent", id: "main", label: "Claw" },
};

test("spawn result is read from raw, details and persisted text shapes", () => {
  assert.deepEqual(extractSpawnResult(accepted), accepted);
  assert.deepEqual(extractSpawnResult({ details: accepted }), accepted);
  assert.deepEqual(extractSpawnResult({ content: [{ type: "text", text: JSON.stringify(accepted, null, 2) }] }), accepted);
  assert.deepEqual(extractSpawnResult(JSON.stringify(accepted)), accepted);
  assert.deepEqual(extractSpawnResult({ content: [{ type: "text", text: "not json" }] }), {});
  assert.deepEqual(extractSpawnResult(undefined), {});
});

test("visible spawn resolves label, url and owner", () => {
  const spawn = resolveVisibleSpawn({
    toolName: "sessions_spawn",
    params: { visible: true, label: "Ricerca", taskName: "ricerca-x", runtime: "subagent" },
    result: { content: [{ type: "text", text: JSON.stringify(accepted) }] },
  });
  assert.deepEqual(spawn, {
    agentId: "",
    label: "Ricerca",
    mode: "run",
    runId: accepted.runId,
    childSessionKey: accepted.childSessionKey,
    sessionUrl: accepted.sessionUrl,
    ownerLabel: "Claw",
  });
});

test("hidden, failed and rejected spawns are ignored", () => {
  assert.equal(resolveVisibleSpawn({ params: { label: "x" }, result: accepted }), null);
  assert.equal(resolveVisibleSpawn({ params: { visible: true }, result: accepted, error: "boom" }), null);
  assert.equal(resolveVisibleSpawn({ params: { visible: true }, result: { status: "forbidden", error: "nope" } }), null);
  assert.equal(resolveVisibleSpawn({ params: { visible: true }, result: {} }), null);
});

test("task name is the label fallback", () => {
  const spawn = resolveVisibleSpawn({ params: { visible: true, taskName: "conteggio" }, result: accepted });
  assert.equal(spawn.label, "conteggio");
});

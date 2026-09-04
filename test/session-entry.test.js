import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionEntryReader } from "../session-entry.js";

test("requester session reader prefers hook-provided entry", async () => {
  let runtimeCalls = 0;
  const reader = createSessionEntryReader({
    loadRuntime: async () => { runtimeCalls += 1; return { getSessionEntry: () => ({ bad: true }) }; },
    legacyReader: () => ({ bad: true }),
  });

  const result = await reader.read({
    sessionKey: "agent:main:discord:channel:123",
    ctx: { sessionEntry: { lastChannel: "discord", lastTo: "123" } },
  });

  assert.deepEqual(result, { entry: { lastChannel: "discord", lastTo: "123" }, source: "hook" });
  assert.equal(runtimeCalls, 0);
});

test("requester session reader uses the canonical helper with session identity", async () => {
  let received;
  let legacyCalls = 0;
  const reader = createSessionEntryReader({
    loadRuntime: async () => ({ getSessionEntry: (params) => { received = params; return { lastChannel: "discord" }; } }),
    legacyReader: () => { legacyCalls += 1; return { bad: true }; },
  });

  const result = await reader.read({ sessionKey: "agent:worker:discord:channel:123", ctx: {} });

  assert.deepEqual(result, { entry: { lastChannel: "discord" }, source: "canonical" });
  assert.equal(received.sessionKey, "agent:worker:discord:channel:123");
  assert.equal(received.agentId, "worker");
  assert.equal(legacyCalls, 0);
});

test("requester session reader uses legacy files only when helper is unavailable", async () => {
  let legacyCalls = 0;
  const reader = createSessionEntryReader({
    loadRuntime: async () => ({}),
    legacyReader: (sessionKey) => { legacyCalls += 1; return { key: sessionKey }; },
  });

  const result = await reader.read({ sessionKey: "agent:main:discord:channel:123", ctx: {} });

  assert.deepEqual(result, { entry: { key: "agent:main:discord:channel:123" }, source: "legacy" });
  assert.equal(legacyCalls, 1);
});

test("legacy compatibility reads a nonempty sessions.json fixture on a host without the helper", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "agent-notifications-legacy-"));
  const sessionKey = "agent:main:discord:channel:123";
  const sessionsDir = join(stateDir, "agents", "main", "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(join(sessionsDir, "sessions.json"), JSON.stringify({ sessions: { [sessionKey]: { lastChannel: "discord" } } }));
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  delete process.env.OPENCLAW_STATE_DIR;
  const previousHome = process.env.OPENCLAW_HOME;
  process.env.OPENCLAW_HOME = stateDir;
  try {
    const result = await createSessionEntryReader({ loadRuntime: async () => null }).read({ sessionKey, ctx: {} });
    assert.deepEqual(result, { entry: { lastChannel: "discord" }, source: "legacy" });
  } finally {
    if (previousStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = previousStateDir;
    if (previousHome === undefined) delete process.env.OPENCLAW_HOME;
    else process.env.OPENCLAW_HOME = previousHome;
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("requester session reader does not resurrect legacy data after helper errors or empty reads", async () => {
  let legacyCalls = 0;
  const reader = createSessionEntryReader({
    loadRuntime: async () => ({ getSessionEntry: () => { throw new Error("sqlite unavailable"); } }),
    legacyReader: () => { legacyCalls += 1; return { stale: true }; },
    logger: { error() {} },
  });
  const errorResult = await reader.read({ sessionKey: "agent:main:discord:channel:123", ctx: {} });
  assert.equal(errorResult.source, "canonical-error");
  assert.equal(errorResult.entry, null);

  const emptyReader = createSessionEntryReader({
    loadRuntime: async () => ({ getSessionEntry: () => undefined }),
    legacyReader: () => { legacyCalls += 1; return { stale: true }; },
  });
  const emptyResult = await emptyReader.read({ sessionKey: "agent:main:discord:channel:123", ctx: {} });
  assert.deepEqual(emptyResult, { entry: null, source: "canonical" });
  assert.equal(legacyCalls, 0);
});

test("requester session reader fails closed when the runtime module itself errors", async () => {
  let legacyCalls = 0;
  const reader = createSessionEntryReader({
    loadRuntime: async () => { throw new Error("broken runtime module"); },
    legacyReader: () => { legacyCalls += 1; return { stale: true }; },
    logger: { error() {} },
  });

  const result = await reader.read({ sessionKey: "agent:main:discord:channel:123", ctx: {} });

  assert.equal(result.source, "runtime-error");
  assert.equal(result.entry, null);
  assert.equal(legacyCalls, 0);
});
